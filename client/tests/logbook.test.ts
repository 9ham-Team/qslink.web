import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LogbookVue3 from '../src/pages/Logbook.vue';
import type { LogbookImportResultVue3, LogbookPageResponseVue3, LogbookServicesVue3, SelfUserVue3 } from '../src/contracts';

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function makeUser(overrides: Partial<SelfUserVue3> = {}): SelfUserVue3 {
  return {
    id: 'u1',
    uid: '10001',
    username: 'bh4abc',
    displayName: 'BH4ABC',
    callSign: 'BH4ABC',
    ...overrides,
  };
}

function makeServices(user: SelfUserVue3 | null, overrides: Partial<LogbookServicesVue3> = {}) {
  let currentUser = user;
  let currentToken: string | null = user ? 'tok-1' : null;
  const authListeners = new Set<(u: SelfUserVue3 | null) => void>();

  const services: LogbookServicesVue3 = {
    t: s => s,
    user: () => currentUser,
    token: () => currentToken,
    onAuth: fn => {
      authListeners.add(fn as (u: SelfUserVue3 | null) => void);
      return () => authListeners.delete(fn as (u: SelfUserVue3 | null) => void);
    },
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    likeCard: vi.fn(),
    image: vi.fn(),
    placeholder: '/assets/placeholder.svg',
    formatDate: v => v,
    formatNumber: v => String(v),
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(() => ({ close: vi.fn() })),
    listLogbook: vi.fn(async (page): Promise<LogbookPageResponseVue3> => ({
      items: [
        {
          id: `qso-${page}`,
          qsoAt: '2026-11-10T23:45:00.000Z',
          callSign: 'JA1ABC',
          stationCallSign: 'BH4ABC',
          band: '20m',
          mode: 'FT8',
          frequency: '14.074',
          rstSent: '-10',
          rstReceived: '-12',
          lotwConfirmed: true,
          source: 'lotw',
        },
      ],
      total: 30,
      page,
      limit: 25,
      pages: 2,
      stats: { total: 42, confirmed: 15 },
    })),
    importLogbookFile: vi.fn(async (): Promise<LogbookImportResultVue3> => ({
      added: 1,
      updated: 0,
      duplicates: 0,
      skipped: 0,
      total: 1,
      issues: [],
    })),
    importLotw: vi.fn(async (): Promise<LogbookImportResultVue3> => ({
      added: 2,
      updated: 1,
      duplicates: 0,
      skipped: 0,
      total: 3,
      issues: [],
    })),
    ...overrides,
  };

  return {
    services,
    emitAuth(next: SelfUserVue3 | null, nextToken: string | null = next ? 'tok-2' : null) {
      currentUser = next;
      currentToken = nextToken;
      authListeners.forEach(fn => fn(next));
    },
  };
}

describe('LogbookVue3', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('redirects guests to login', async () => {
    const { services } = makeServices(null);
    const wrapper = mount(LogbookVue3, { props: { services } });
    await flush();
    expect(services.navigate).toHaveBeenCalledWith('/login?next=%2Fdashboard%2Flogbook', { replace: true });
    expect(services.listLogbook).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('locks imports without callsign and unlocks when same-account auth updates callsign', async () => {
    const { services, emitAuth } = makeServices(makeUser({ callSign: '' }));
    const wrapper = mount(LogbookVue3, { props: { services } });
    await flush();

    const fileBtn = wrapper.get('[data-file-import] button[type="submit"]');
    expect((fileBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.find('a[href="/dashboard/profile"]').exists()).toBe(true);

    // Same account updates callsign
    emitAuth(makeUser({ callSign: 'bg7mom' }), 'tok-1');
    await flush();

    expect((fileBtn.element as HTMLButtonElement).disabled).toBe(false);
    expect(wrapper.get('.f-logbook-callsign-hint').text()).toContain('BG7MOM');
    wrapper.unmount();
  });

  it('displays UTC time verbatim, keeps committed page on pagination failure, and ignores late search results', async () => {
    let callCount = 0;
    const { services } = makeServices(makeUser(), {
      listLogbook: vi.fn(async (page) => {
        callCount++;
        if (callCount === 2) throw new Error('网络超时');
        return {
          items: [
            {
              id: `qso-${page}`,
              qsoAt: '2026-11-10T23:45:00.000Z',
              callSign: 'JA1ABC',
              stationCallSign: 'BH4ABC',
              band: '20m',
              mode: 'FT8',
              lotwConfirmed: true,
              source: 'adif',
            },
          ],
          total: 30,
          page,
          limit: 25,
          pages: 2,
          stats: { total: 42, confirmed: 15 },
        };
      }),
    });

    const wrapper = mount(LogbookVue3, { props: { services } });
    await flush();

    expect(wrapper.get('tbody tr td').text()).toBe('2026-11-10 23:45:00');
    expect(wrapper.get('[data-stats]').text()).toContain('42 条 · LoTW 已确认 15 条');
    expect(wrapper.get('[data-page]').text()).toContain('第 1 / 2 页');

    // Click next page -> fails -> committed page stays 1
    await wrapper.get('[data-next]').trigger('click');
    await flush();
    expect(wrapper.get('[data-page]').text()).toContain('第 1 / 2 页');
    expect(wrapper.get('[data-retry]').exists()).toBe(true);

    // Retry after page 2 failure -> retries page 2 (not page 1)
    await wrapper.get('[data-retry]').trigger('click');
    await flush();
    expect(services.listLogbook).toHaveBeenLastCalledWith(2, '', expect.any(AbortSignal));

    // Search JA2XYZ fails -> retry re-requests (1, 'JA2XYZ'), not empty query
    (services.listLogbook as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('search failed'))
      .mockResolvedValueOnce({
        items: [{
          id: 'q2',
          qsoAt: '2026-11-11T01:02:00.000Z',
          callSign: 'JA2XYZ',
          stationCallSign: 'BG4TEST',
          band: '40m',
          mode: 'CW',
          submode: '',
          frequency: '7.023',
          rstSent: '599',
          rstReceived: '599',
          lotwConfirmed: false,
          source: 'adif',
        }],
        page: 1,
        pages: 1,
        total: 1,
        stats: { total: 42, confirmed: 15 },
      });
    await wrapper.get('[data-search] input[name="q"]').setValue('JA2XYZ');
    await wrapper.get('[data-search]').trigger('submit');
    await flush();
    expect(wrapper.get('[data-retry]').exists()).toBe(true);
    await wrapper.get('[data-retry]').trigger('click');
    await flush();
    expect(services.listLogbook).toHaveBeenLastCalledWith(1, 'JA2XYZ', expect.any(AbortSignal));
    expect(wrapper.text()).toContain('JA2XYZ');
    wrapper.unmount();
  });

  it('rejects invalid UTF-8 ADIF and encodes TQ8 as binary base64', async () => {
    const { services } = makeServices(makeUser());
    const wrapper = mount(LogbookVue3, { props: { services } });
    await flush();

    // Invalid UTF-8 .adi
    const badBytes = new Uint8Array([0xff, 0xfe, 0xfd]);
    const badFile = new File([badBytes], 'bad.adi', { type: 'text/plain' });
    Object.defineProperty(badFile, 'arrayBuffer', { value: async () => badBytes.buffer });
    const fileInput = wrapper.get('[data-file-import] input[type="file"]').element as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [badFile], configurable: true });
    await wrapper.get('[data-file-import] input[type="file"]').trigger('change');
    await wrapper.get('[data-file-import]').trigger('submit');
    await flush();

    expect(services.importLogbookFile).not.toHaveBeenCalled();
    expect(wrapper.get('[data-field-error="file"]').text()).toContain('UTF-8');

    // Valid binary .tq8 (contains non-UTF8 bytes like 0x1f 0x8b)
    const tq8Bytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xff]);
    const tq8File = new File([tq8Bytes], 'signed.tq8', { type: 'application/octet-stream' });
    Object.defineProperty(tq8File, 'arrayBuffer', { value: async () => tq8Bytes.buffer });
    Object.defineProperty(fileInput, 'files', { value: [tq8File], configurable: true });
    await wrapper.get('[data-file-import] input[type="file"]').trigger('change');
    await wrapper.get('[data-file-import]').trigger('submit');
    await flush();

    expect(services.importLogbookFile).toHaveBeenCalledWith(
      { tq8: btoa(String.fromCharCode(...tq8Bytes)) },
      expect.any(AbortSignal),
    );
    expect(wrapper.get('[data-result]').text()).toContain('导入完成');
    wrapper.unmount();
  });

  it('clears LoTW password immediately on submit and on account switch without clearing site session on 502', async () => {
    const { services, emitAuth } = makeServices(makeUser(), {
      importLotw: vi.fn(async () => {
        const err = new Error('LoTW 登录失败，请核对账号或密码') as Error & { status?: number };
        err.status = 502;
        throw err;
      }),
    });
    const wrapper = mount(LogbookVue3, { props: { services } });
    await flush();

    await wrapper.get('[data-lotw] input[name="username"]').setValue('bh4abc');
    const passEl = wrapper.get('[data-lotw] input[name="password"]');
    await passEl.setValue('secret-lotw-pass');
    await wrapper.get('[data-lotw]').trigger('submit');
    await flush();

    expect(services.importLotw).toHaveBeenCalledWith(
      { username: 'bh4abc', password: 'secret-lotw-pass' },
      expect.any(AbortSignal),
    );
    expect((passEl.element as HTMLInputElement).value).toBe('');
    expect(wrapper.get('[data-result]').text()).toContain('LoTW 登录失败');

    // Account switch clears all private state
    emitAuth(null, null);
    await flush();
    expect(wrapper.find('.f-logbook').exists()).toBe(false);
    wrapper.unmount();
  });
});
