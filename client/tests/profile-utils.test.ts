import { describe, expect, it } from 'vitest';
import {
  addressCityVue3,
  applyParsedAddressVue3,
  mapAccountFieldErrorsVue3,
  parseShippingAddressVue3,
  unicodeLengthVue3,
  validateAddressDraftVue3,
  validatePasswordDraftVue3,
  validateProfileDraftVue3,
  type AddressDraftVue3,
} from '../src/profile-utils';

const t = (s: string) => s;

describe('profile-utils', () => {
  it('parses labeled and unlabeled Chinese shipping addresses', () => {
    const parsed = parseShippingAddressVue3('张三 13800138000 广东省深圳市南山区科技南十二路18号 518000');
    expect(parsed).toEqual({
      name: '张三',
      phone: '13800138000',
      province: '广东省',
      city: '深圳市',
      district: '南山区',
      line1: '科技南十二路18号',
      postalCode: '518000',
      country: '中国',
    });

    const labeled = parseShippingAddressVue3('收件人：李四，电话：13912345678，所在地区：北京市海淀区，详细地址：中关村大街1号');
    expect(labeled).toEqual({
      name: '李四',
      phone: '13912345678',
      province: '北京市',
      city: '北京市',
      district: '海淀区',
      line1: '中关村大街1号',
      country: '中国',
    });

    expect(parseShippingAddressVue3('   ')).toBeNull();
  });

  it('fills only empty fields and avoids appending duplicate district to city', () => {
    expect(addressCityVue3('深圳市', '南山区')).toBe('深圳市 南山区');
    expect(addressCityVue3('深圳市 南山区', '南山区')).toBe('深圳市 南山区');

    const draft: AddressDraftVue3 = {
      name: '已有姓名',
      phone: '',
      province: '',
      city: '深圳市 南山区',
      district: '',
      postalCode: '',
      line1: '',
      country: '中国',
    };
    const filled = applyParsedAddressVue3(draft, {
      name: '新姓名',
      phone: '13800138000',
      province: '广东省',
      city: '深圳市',
      district: '南山区',
      line1: '科技南十二路18号',
      postalCode: '518000',
      country: '中国',
    });
    expect(filled).toBe(4);
    expect(draft.name).toBe('已有姓名');
    expect(draft.phone).toBe('13800138000');
    expect(draft.province).toBe('广东省');
    expect(draft.district).toBe('');
    expect(draft.line1).toBe('科技南十二路18号');
    expect(draft.postalCode).toBe('518000');
  });

  it('validates profile, address, and password using Unicode code point lengths', () => {
    const thirtyEmoji = '📻'.repeat(30);
    expect(unicodeLengthVue3(thirtyEmoji)).toBe(30);
    expect(thirtyEmoji.length).toBe(60);

    expect(
      validateProfileDraftVue3(
        { displayName: thirtyEmoji, callSign: 'BG4ABC', bio: '🎧'.repeat(200), avatarColor: '#0EAF8F' },
        ['#0eaf8f'],
        t,
      ),
    ).toEqual({});

    expect(
      validateProfileDraftVue3(
        { displayName: '📻'.repeat(31), callSign: 'BG4ABC', bio: '', avatarColor: '#0eaf8f' },
        ['#0eaf8f'],
        t,
      ),
    ).toHaveProperty('displayName');

    // Server default colors not in the UI swatch list (#22c55e, #f97316) must pass validation
    expect(
      validateProfileDraftVue3(
        { displayName: '火腿', callSign: '', bio: '', avatarColor: '#22c55e' },
        ['#0eaf8f', '#38bdf8'],
        t,
      ),
    ).toEqual({});
    expect(
      validateProfileDraftVue3(
        { displayName: '火腿', callSign: '', bio: '', avatarColor: '#f97316' },
        ['#0eaf8f', '#38bdf8'],
        t,
      ),
    ).toEqual({});
    expect(
      validateProfileDraftVue3(
        { displayName: '火腿', callSign: '', bio: '', avatarColor: 'not-a-color' },
        ['#0eaf8f'],
        t,
      ),
    ).toHaveProperty('avatarColor');

    expect(
      validateAddressDraftVue3(
        { name: '', phone: '', province: '', city: '', district: '', postalCode: '', line1: '', country: '' },
        t,
      ),
    ).toMatchObject({
      name: '请填写收件人姓名',
      city: '请填写城市',
      line1: '请填写详细地址',
    });

    // Passwords are not trimmed and support Unicode code points up to 200
    const emojiPwd = 'A1' + '📻'.repeat(198);
    expect(unicodeLengthVue3(emojiPwd)).toBe(200);
    expect(
      validatePasswordDraftVue3({ currentPassword: 'old', newPassword: emojiPwd, confirmPassword: emojiPwd }, t),
    ).toEqual({});
    expect(
      validatePasswordDraftVue3({ currentPassword: 'old', newPassword: '  Ab1234  ', confirmPassword: '  Ab1234  ' }, t),
    ).toEqual({});
  });

  it('maps nested server address errors to form field keys', () => {
    expect(
      mapAccountFieldErrorsVue3({
        'address.name': '收件人姓名需为 1-30 个字符',
        'address.line1': '详细地址需为 1-100 个字符',
        contactName: '姓名错误',
      }),
    ).toEqual({
      name: '收件人姓名需为 1-30 个字符',
      line1: '详细地址需为 1-100 个字符',
    });
  });
});
