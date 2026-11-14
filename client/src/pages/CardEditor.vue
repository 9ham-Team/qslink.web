<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Card3DViewerVue3 from '../components/Card3DViewer.vue';
import CardStockDialogVue3 from '../components/CardStockDialog.vue';
import DialogVue3 from '../components/Dialog.vue';
import IconVue3 from '../components/Icon.vue';
import type {
  CardCreatePayloadVue3,
  CardManageServicesVue3,
  CardUpdatePayloadVue3,
  ContestWorkSummaryVue3,
  ImageProcessorVue3,
  MyCardItemVue3,
  RouteContextVue3,
} from '../contracts';
import {
  CARD_LIMITS_VUE3,
  RATIO_PRESETS_VUE3,
  cardUserKeyVue3,
  codePointLengthVue3,
  formatFileSizeVue3,
  parseStockInputVue3,
  sanitizeRatioInputVue3,
  validateImageFileVue3,
} from '../card-manage-utils';

const props = defineProps<{
  ctx: RouteContextVue3;
  services: CardManageServicesVue3;
}>();

interface EditorImageState {
  src: string;
  size: number | null;
  name: string;
  width: number | null;
  height: number | null;
  isNew: boolean;
}

const cardId = computed(() => props.ctx.params?.id || '');
const isEdit = computed(() => !!cardId.value);

const title = ref('');
const callSign = ref('');
const notes = ref('');
const stockText = ref('');
const ratio = ref({ w: 3, h: 2 });
const ratioWText = ref('3');
const ratioHText = ref('2');
const contentConsent = ref(false);

const images = ref<{ front: EditorImageState | null; back: EditorImageState | null }>({
  front: null,
  back: null,
});
const readingSide = ref<{ front: boolean; back: boolean }>({ front: false, back: false });
const dragSide = ref<{ front: boolean; back: boolean }>({ front: false, back: false });
const shakeSide = ref<{ front: boolean; back: boolean }>({ front: false, back: false });

const dirty = ref(false);
const submitting = ref(false);
const processingCount = ref(0);
const loadingCard = ref(isEdit.value);
const cardLoadError = ref('');
const cardLoadRetryable = ref(false);
const editorCard = ref<MyCardItemVue3 | null>(null);

const contestOptIn = ref(false);
const contestDescription = ref('');
const contestCount = ref(0);
const contestCardInEntry = ref(false);
const contestKnown = ref(false);
const contestWork = ref<ContestWorkSummaryVue3 | null>(null);
const contestLoadFailed = ref(false);

const stockModalOpen = ref(false);
const contestModalOpen = ref(false);
const contestDraft = ref('');
const contestModalError = ref('');

const leaveConfirmOpen = ref(false);
let leaveResolve: ((ok: boolean) => void) | null = null;

const fieldErrors = ref<{
  title?: string;
  callSign?: string;
  notes?: string;
  stock?: string;
  ratio?: string;
  consent?: string;
  contest?: string;
}>({});

const networkNotice = ref('');

const titleInputRef = ref<HTMLInputElement>();
const callSignInputRef = ref<HTMLInputElement>();
const notesInputRef = ref<HTMLTextAreaElement>();
const stockInputRef = ref<HTMLInputElement>();
const consentInputRef = ref<HTMLInputElement>();
const frontFileRef = ref<HTMLInputElement>();
const backFileRef = ref<HTMLInputElement>();
const frontZoneRef = ref<HTMLElement>();
const backZoneRef = ref<HTMLElement>();
const contestTextRef = ref<HTMLTextAreaElement>();

let active = true;
let generation = 0;
let imageEpoch = 0;
const sideVersion = { front: 0, back: 0 };
let currentUserKey = cardUserKeyVue3(props.services.user());
let cardController: AbortController | null = null;
let contestController: AbortController | null = null;
let submitController: AbortController | null = null;
let processor: ImageProcessorVue3 = props.services.createImageProcessor();
let shakeTimers: Partial<Record<'front' | 'back', number>> = {};

const viewerOptions = {
  width: null,
  interactive: true,
  showControls: true,
  initialSide: 'front',
  ambient: true,
};

const titleCount = computed(() => codePointLengthVue3(title.value));
const notesCount = computed(() => codePointLengthVue3(notes.value));
const contestDraftCount = computed(() => codePointLengthVue3(contestDraft.value.trim()));

const ratioDirectionText = computed(() => {
  if (ratio.value.w > ratio.value.h) return props.services.t('横版');
  if (ratio.value.w < ratio.value.h) return props.services.t('竖版');
  return props.services.t('方形');
});

const ratioSummaryText = computed(() =>
  props.services.t('比例') + ' ' + ratio.value.w + ' : ' + ratio.value.h + ' · ' + ratioDirectionText.value,
);

const previewSidesText = computed(() => {
  const parts = [
    images.value.front ? props.services.t('正面已就绪') : props.services.t('正面待上传'),
    images.value.back ? props.services.t('背面已就绪') : props.services.t('背面留空'),
  ];
  return parts.join(' · ');
});

const contestLimitReached = computed(
  () => contestKnown.value && contestCount.value >= 2 && !contestCardInEntry.value,
);

const contestStatusText = computed(() => {
  if (!contestOptIn.value) return '';
  if (contestWork.value && contestWork.value.number != null) {
    return props.services.t('已在参赛作品中（编号 {number}）；修改参赛说明后需随卡片重新审核。', {
      number: String(contestWork.value.number).padStart(3, '0'),
    });
  }
  return props.services.t('提交后与卡片一起审核，审核通过即自动参赛。');
});

const submitDisabled = computed(() =>
  submitting.value ||
  processingCount.value > 0 ||
  loadingCard.value ||
  !!cardLoadError.value ||
  stockModalOpen.value,
);

const submitLabel = computed(() => {
  if (submitting.value) return props.services.t('提交中…');
  if (processingCount.value > 0) return props.services.t('图片处理中…');
  return props.services.t('提交审核');
});

const cardStatusNotice = computed(() => {
  if (networkNotice.value) return { tone: 'danger', icon: 'alert' as const, kind: 'network' as const, text: networkNotice.value };
  const card = editorCard.value;
  if (!isEdit.value || !card) return null;
  if (card.status === 'rejected') return { tone: 'danger', icon: 'alert' as const, kind: 'rejected' as const, reason: card.rejectReason || '' };
  if (card.status === 'pending') return { tone: 'warn', icon: 'clock' as const, kind: 'pending' as const };
  return { tone: 'warn', icon: 'info' as const, kind: 'approved' as const };
});

function markDirty() {
  if (!dirty.value) dirty.value = true;
}

function triggerShake(side: 'front' | 'back') {
  if (shakeTimers[side]) window.clearTimeout(shakeTimers[side]);
  shakeSide.value[side] = false;
  window.setTimeout(() => {
    if (!active) return;
    shakeSide.value[side] = true;
    shakeTimers[side] = window.setTimeout(() => {
      shakeSide.value[side] = false;
      delete shakeTimers[side];
    }, 520);
  }, 0);
}

function zoneLabelText(side: 'front' | 'back'): string {
  const img = images.value[side];
  if (!img) return '';
  return img.isNew ? (img.name || props.services.t('已选择的图片')) : props.services.t('已保存的图片');
}

function zoneMetaText(side: 'front' | 'back'): string {
  const img = images.value[side];
  if (!img) return '';
  const dim = img.width && img.height ? img.width + ' × ' + img.height : '';
  const size = img.size ? formatFileSizeVue3(img.size) : '';
  return [dim, size].filter(Boolean).join(' · ');
}

function openFilePicker(side: 'front' | 'back') {
  if (readingSide.value[side] || submitting.value || loadingCard.value) return;
  const input = side === 'front' ? frontFileRef.value : backFileRef.value;
  input?.click();
}

function onFileInputChange(side: 'front' | 'back', event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files && input.files[0];
  input.value = '';
  if (file) void handleFile(side, file);
}

function onZoneDragOver(side: 'front' | 'back', event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (!readingSide.value[side] && !submitting.value && !loadingCard.value) {
    dragSide.value[side] = true;
  }
}

function onZoneDragLeave(side: 'front' | 'back', event: DragEvent) {
  event.preventDefault();
  dragSide.value[side] = false;
}

function onZoneDrop(side: 'front' | 'back', event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  dragSide.value[side] = false;
  if (readingSide.value[side] || submitting.value || loadingCard.value) return;
  const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
  if (file) void handleFile(side, file);
  else props.services.toast(props.services.t('没有检测到图片文件，请重试'), 'error');
}

async function handleFile(side: 'front' | 'back', file: File) {
  if (!active || submitting.value || loadingCard.value) return;
  const errMsg = validateImageFileVue3(file, props.services.t);
  if (errMsg) {
    props.services.toast(errMsg, 'error');
    triggerShake(side);
    return;
  }

  const myEpoch = imageEpoch;
  const mySideVer = ++sideVersion[side];
  const userKeyAtStart = currentUserKey;
  readingSide.value[side] = true;
  processingCount.value++;
  markDirty();

  try {
    const prepared = await processor.process(file);
    if (!active || myEpoch !== imageEpoch || mySideVer !== sideVersion[side] || currentUserKey !== userKeyAtStart) {
      return;
    }
    images.value[side] = {
      src: prepared.src,
      size: file.size,
      name: file.name,
      width: prepared.width,
      height: prepared.height,
      isNew: true,
    };
    markDirty();
    props.services.toast(
      (side === 'front' ? props.services.t('卡片正面') : props.services.t('卡片背面')) +
        props.services.t('已选择，记得提交审核'),
      'success',
    );
  } catch (err) {
    if (!active || myEpoch !== imageEpoch || mySideVer !== sideVersion[side] || currentUserKey !== userKeyAtStart) {
      return;
    }
    const msg = (err instanceof Error ? err.message : '') || props.services.t('图片处理失败，请重新选择');
    props.services.toast(msg, 'error');
  } finally {
    if (myEpoch === imageEpoch) {
      processingCount.value = Math.max(0, processingCount.value - 1);
      if (mySideVer === sideVersion[side]) {
        readingSide.value[side] = false;
      }
    }
  }
}

function applyPresetRatio(w: number, h: number) {
  ratio.value = { w, h };
  ratioWText.value = String(w);
  ratioHText.value = String(h);
  fieldErrors.value.ratio = undefined;
  markDirty();
}

function onRatioInput() {
  const w = sanitizeRatioInputVue3(ratioWText.value);
  const h = sanitizeRatioInputVue3(ratioHText.value);
  markDirty();
  if (w === null || h === null) return;
  ratio.value = { w, h };
  fieldErrors.value.ratio = undefined;
}

function onRatioBlur() {
  const w = sanitizeRatioInputVue3(ratioWText.value);
  const h = sanitizeRatioInputVue3(ratioHText.value);
  if (w === null) ratioWText.value = String(ratio.value.w);
  if (h === null) ratioHText.value = String(ratio.value.h);
}

function onCallSignInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const pos = input.selectionStart;
  const upper = input.value.toUpperCase();
  callSign.value = upper;
  input.value = upper;
  if (pos !== null) {
    try { input.setSelectionRange(pos, pos); } catch { /* ignore */ }
  }
  fieldErrors.value.callSign = undefined;
  markDirty();
}

function openContestModal() {
  if (contestModalOpen.value || submitting.value || loadingCard.value) return;
  if (contestLimitReached.value && !contestOptIn.value) {
    props.services.toast(
      props.services.t('你的参赛作品已达 2 件，无法再自动参赛；如需更换，请前往比赛报名调整。'),
      'error',
    );
    return;
  }
  contestDraft.value = contestDescription.value;
  contestModalError.value = '';
  contestModalOpen.value = true;
}

function closeContestModal() {
  contestModalOpen.value = false;
  contestModalError.value = '';
}

function saveContestModal() {
  const trimmed = contestDraft.value.trim();
  const len = codePointLengthVue3(trimmed);
  if (!len || len > CARD_LIMITS_VUE3.contestDescription) {
    contestModalError.value = props.services.t('参赛说明须为 1–2000 字');
    contestTextRef.value?.focus();
    return;
  }
  contestOptIn.value = true;
  contestDescription.value = trimmed;
  fieldErrors.value.contest = undefined;
  contestModalOpen.value = false;
  markDirty();
}

function onContestCheckboxChange(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  if (checked) {
    // Keep model false until modal is explicitly saved.
    (event.target as HTMLInputElement).checked = contestOptIn.value;
    if (contestLimitReached.value && !contestOptIn.value) {
      props.services.toast(
        props.services.t('你的参赛作品已达 2 件，无法再自动参赛；如需更换，请前往比赛报名调整。'),
        'error',
      );
      return;
    }
    openContestModal();
    return;
  }
  contestOptIn.value = false;
  fieldErrors.value.contest = undefined;
  markDirty();
}

function onStockSaved(updated: MyCardItemVue3) {
  if (!editorCard.value) return;
  // Update only stock & updatedAt; never overwrite draft fields or clear dirty state.
  editorCard.value = {
    ...editorCard.value,
    stock: updated.stock,
    updatedAt: updated.updatedAt || editorCard.value.updatedAt,
  };
}

function mapServerFields(fields?: Record<string, string>) {
  if (!fields) return;
  const aliases: Record<string, string> = {
    frontImage: 'front',
    backImage: 'back',
    'ratio.w': 'ratioW',
    'ratio.h': 'ratioH',
  };
  let mapped = 0;
  for (const key of Object.keys(fields)) {
    const short = String(key).split('.').pop() || key;
    const field = aliases[key] || aliases[short] || short;
    const msg = props.services.i18nError(fields[key]);
    if (field === 'ratioW' || field === 'ratioH' || field === 'ratio') {
      fieldErrors.value.ratio = msg;
      mapped++;
    } else if (field === 'contestOptIn' || field === 'contestDescription') {
      fieldErrors.value.contest = msg;
      mapped++;
    } else if (field === 'front' || field === 'back' || field === 'title') {
      fieldErrors.value.title = msg;
      mapped++;
    } else if (field === 'callSign') {
      fieldErrors.value.callSign = msg;
      mapped++;
    } else if (field === 'notes') {
      fieldErrors.value.notes = msg;
      mapped++;
    } else if (field === 'stock') {
      fieldErrors.value.stock = msg;
      mapped++;
    }
  }
  if (!mapped && fields.ratio) fieldErrors.value.ratio = props.services.i18nError(fields.ratio);
}

function validateForm(): {
  errors: string[];
  values: {
    title: string;
    callSign: string;
    notes: string;
    stock: number | null;
    ratio: { w: number; h: number };
    frontImage: string;
    backImage: string;
  };
} {
  fieldErrors.value = {};
  const trimmedTitle = title.value.trim();
  const trimmedCallSign = callSign.value.trim().toUpperCase();
  const trimmedNotes = notes.value.trim();
  const frontSrc = images.value.front ? images.value.front.src : '';
  const backSrc = images.value.back ? images.value.back.src : '';

  let parsedStock: number | null = null;
  const errors: string[] = [];

  if (!isEdit.value) {
    const stockCheck = parseStockInputVue3(stockText.value, !!stockInputRef.value?.validity?.badInput);
    if (!stockCheck.ok) {
      fieldErrors.value.stock = props.services.t('库存需为 0–2147483647 的整数，或留空');
      errors.push('stock');
    } else {
      parsedStock = stockCheck.value;
    }
  }

  const tLen = codePointLengthVue3(trimmedTitle);
  if (!tLen) {
    fieldErrors.value.title = props.services.t('请填写卡片标题');
    errors.push('title');
  } else if (tLen > CARD_LIMITS_VUE3.title) {
    fieldErrors.value.title = props.services.t('标题不能超过 60 个字符');
    errors.push('title');
  }

  if (codePointLengthVue3(trimmedCallSign) > CARD_LIMITS_VUE3.callSign) {
    fieldErrors.value.callSign = props.services.t('呼号不能超过 20 个字符');
    errors.push('callSign');
  }

  if (codePointLengthVue3(trimmedNotes) > CARD_LIMITS_VUE3.notes) {
    fieldErrors.value.notes = props.services.t('卡片简介不能超过 300 个字符');
    errors.push('notes');
  }

  const w = sanitizeRatioInputVue3(ratioWText.value);
  const h = sanitizeRatioInputVue3(ratioHText.value);
  if (w === null || h === null) {
    fieldErrors.value.ratio = props.services.t('宽高需为 1 - 1000 的整数');
    errors.push('ratio');
  } else {
    ratio.value = { w, h };
  }

  if (!frontSrc) {
    props.services.toast(props.services.t('请先上传卡片正面图片'), 'error');
    errors.push('frontImage');
  }

  return {
    errors,
    values: {
      title: trimmedTitle,
      callSign: trimmedCallSign,
      notes: trimmedNotes,
      stock: parsedStock,
      ratio: ratio.value,
      frontImage: frontSrc,
      backImage: backSrc,
    },
  };
}

async function onSubmit() {
  if (submitDisabled.value) return;
  networkNotice.value = '';

  if (!contentConsent.value) {
    fieldErrors.value.consent = props.services.t('请确认内容权利及授权后再提交');
    consentInputRef.value?.focus();
    return;
  }
  fieldErrors.value.consent = undefined;

  if (contestOptIn.value) {
    const cLen = codePointLengthVue3(contestDescription.value.trim());
    if (!cLen || cLen > CARD_LIMITS_VUE3.contestDescription) {
      fieldErrors.value.contest = props.services.t('参赛说明须为 1–2000 字');
      openContestModal();
      return;
    }
  }

  const { errors, values } = validateForm();
  if (errors.length) {
    if (errors[0] === 'frontImage') {
      frontZoneRef.value?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      triggerShake('front');
    } else if (errors[0] === 'title') {
      titleInputRef.value?.focus();
    } else if (errors[0] === 'callSign') {
      callSignInputRef.value?.focus();
    } else if (errors[0] === 'notes') {
      notesInputRef.value?.focus();
    } else if (errors[0] === 'stock') {
      stockInputRef.value?.focus();
    }
    return;
  }

  submitting.value = true;
  const reqGen = generation;
  const userKeyAtStart = currentUserKey;
  submitController?.abort();
  const abort = new AbortController();
  submitController = abort;

  try {
    const basePayload = {
      acceptTerms: true as const,
      termsVersion: '2026-10-25' as const,
      acceptContentLicense: true as const,
      title: values.title,
      callSign: values.callSign,
      notes: values.notes,
      ratio: { w: values.ratio.w, h: values.ratio.h },
      frontImage: values.frontImage,
      contestOptIn: contestOptIn.value,
      ...(values.backImage ? { backImage: values.backImage } : {}),
      ...(contestOptIn.value ? { contestDescription: contestDescription.value.trim() } : {}),
    };

    if (isEdit.value) {
      const updatePayload: CardUpdatePayloadVue3 = basePayload;
      await props.services.updateCard(cardId.value, updatePayload, abort.signal);
    } else {
      const createPayload: CardCreatePayloadVue3 = { ...basePayload, stock: values.stock };
      await props.services.createCard(createPayload, abort.signal);
    }

    if (!active || reqGen !== generation || currentUserKey !== userKeyAtStart) return;
    dirty.value = false;
    props.services.resetEdits();
    props.services.toast(
      isEdit.value
        ? (contestOptIn.value
          ? props.services.t('修改已提交，需重新审核；通过后保持自动参赛')
          : props.services.t('修改已提交，需重新审核'))
        : (contestOptIn.value
          ? props.services.t('卡片已提交审核，通过后将自动参赛')
          : props.services.t('卡片已提交审核。想参赛，请在审核通过后前往「比赛报名」完成报名。')),
      'success',
    );
    props.services.celebrate(window.innerWidth / 2, window.innerHeight / 3);
    props.services.navigate('/dashboard/cards');
  } catch (err) {
    if (!active || reqGen !== generation || abort.signal.aborted || currentUserKey !== userKeyAtStart) return;
    const apiErr = err as { fields?: Record<string, string>; isNetwork?: boolean; message?: string };
    if (apiErr.fields) mapServerFields(apiErr.fields);
    if (apiErr.isNetwork) {
      networkNotice.value = props.services.t('网络连接失败，请确认服务已启动后重试。');
    }
    props.services.toast((apiErr.message && props.services.i18nError(apiErr.message)) || props.services.t('提交失败，请稍后重试'), 'error');
  } finally {
    if (submitController === abort) submitController = null;
    if (active && reqGen === generation) submitting.value = false;
  }
}

async function loadContestState() {
  if (!active || !props.services.user()) return;
  const reqGen = generation;
  const userKeyAtStart = currentUserKey;
  contestController?.abort();
  const abort = new AbortController();
  contestController = abort;
  contestLoadFailed.value = false;

  try {
    const data = await props.services.getContestEntry(abort.signal);
    if (!active || reqGen !== generation || currentUserKey !== userKeyAtStart) return;
    const works = (data.entry && data.entry.works) || [];
    contestCount.value = works.length;
    contestCardInEntry.value = !!cardId.value && works.some(w => w.cardId === cardId.value);
    contestKnown.value = true;
  } catch {
    if (!active || reqGen !== generation || abort.signal.aborted || currentUserKey !== userKeyAtStart) return;
    contestKnown.value = false;
    contestLoadFailed.value = true;
  } finally {
    if (contestController === abort) contestController = null;
  }
}

async function loadCard() {
  if (!isEdit.value || !active || !props.services.user()) return;
  const reqGen = generation;
  const userKeyAtStart = currentUserKey;
  cardController?.abort();
  const abort = new AbortController();
  cardController = abort;
  loadingCard.value = true;
  cardLoadError.value = '';
  cardLoadRetryable.value = false;

  try {
    const res = await props.services.getCardDetail(cardId.value, abort.signal);
    if (!active || reqGen !== generation || currentUserKey !== userKeyAtStart) return;
    const card = res && res.card;
    if (!card) {
      cardLoadError.value = props.services.t('卡片不存在');
      return;
    }
    const user = props.services.user();
    const cardRecord = card as unknown as MyCardItemVue3 & { isOwner?: boolean };
    if (cardRecord.isOwner === false || (res.owner?.id && user?.id && res.owner.id !== user.id)) {
      cardLoadError.value = props.services.t('只能编辑自己的卡片');
      props.services.toast(cardLoadError.value, 'error');
      return;
    }
    if (dirty.value) return;

    const mappedCard = card as unknown as MyCardItemVue3;
    editorCard.value = mappedCard;
    title.value = mappedCard.title || '';
    callSign.value = mappedCard.callSign || '';
    notes.value = mappedCard.notes || '';
    const r = mappedCard.ratio && mappedCard.ratio.w && mappedCard.ratio.h ? mappedCard.ratio : { w: 3, h: 2 };
    ratio.value = { w: r.w, h: r.h };
    ratioWText.value = String(r.w);
    ratioHText.value = String(r.h);
    contestOptIn.value = mappedCard.contestOptIn === true;
    contestDescription.value = mappedCard.contestDescription || '';
    contestWork.value = mappedCard.contestWork || null;
    if (mappedCard.contestWork) contestCardInEntry.value = true;

    images.value = {
      front: mappedCard.frontImage
        ? { src: mappedCard.frontImage, size: null, name: '', width: null, height: null, isNew: false }
        : null,
      back: mappedCard.backImage
        ? { src: mappedCard.backImage, size: null, name: '', width: null, height: null, isNew: false }
        : null,
    };
  } catch (err) {
    if (!active || reqGen !== generation || abort.signal.aborted || currentUserKey !== userKeyAtStart) return;
    const apiErr = err as { status?: number; message?: string };
    cardLoadError.value = (apiErr.message && props.services.i18nError(apiErr.message)) || props.services.t('卡片加载失败');
    cardLoadRetryable.value = !apiErr.status || apiErr.status >= 500;
    props.services.toast(cardLoadError.value, 'error');
  } finally {
    if (cardController === abort) cardController = null;
    if (active && reqGen === generation) loadingCard.value = false;
  }
}

function resetStateForUser(nextUser: { id?: string; uid?: string; callSign?: string } | null) {
  generation++;
  imageEpoch++;
  sideVersion.front++;
  sideVersion.back++;
  cardController?.abort();
  cardController = null;
  contestController?.abort();
  contestController = null;
  submitController?.abort();
  submitController = null;
  processor.destroy();
  processor = props.services.createImageProcessor();

  processingCount.value = 0;
  readingSide.value = { front: false, back: false };
  submitting.value = false;
  dirty.value = false;
  props.services.resetEdits();
  stockModalOpen.value = false;
  contestModalOpen.value = false;
  if (leaveResolve) {
    leaveResolve(false);
    leaveResolve = null;
  }
  leaveConfirmOpen.value = false;

  images.value = { front: null, back: null };
  title.value = '';
  callSign.value = !isEdit.value && nextUser?.callSign ? nextUser.callSign : '';
  notes.value = '';
  stockText.value = '';
  ratio.value = { w: 3, h: 2 };
  ratioWText.value = '3';
  ratioHText.value = '2';
  contentConsent.value = false;
  contestOptIn.value = false;
  contestDescription.value = '';
  contestCount.value = 0;
  contestCardInEntry.value = false;
  contestKnown.value = false;
  contestWork.value = null;
  contestLoadFailed.value = false;
  editorCard.value = null;
  cardLoadError.value = '';
  networkNotice.value = '';
  fieldErrors.value = {};
}

function resolveLeave(ok: boolean) {
  leaveConfirmOpen.value = false;
  const resolve = leaveResolve;
  leaveResolve = null;
  if (ok) {
    dirty.value = false;
    props.services.resetEdits();
  }
  resolve?.(ok);
}

const offLeaveGuard = props.services.setLeaveGuard(() => {
  if (!active || !dirty.value || submitting.value) return true;
  if (leaveConfirmOpen.value) return false;
  leaveConfirmOpen.value = true;
  const guardGen = generation;
  return new Promise<boolean>(resolve => {
    leaveResolve = ok => {
      if (!active || guardGen !== generation) {
        resolve(false);
        return;
      }
      resolve(ok);
    };
  });
});

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (props.services.isLanguageSwitching()) return undefined;
  if (!dirty.value || submitting.value) return undefined;
  event.preventDefault();
  event.returnValue = '';
  return '';
}

function preventWindowDrop(event: Event) {
  event.preventDefault();
}

const offAuth = props.services.onAuth(user => {
  const nextKey = cardUserKeyVue3(user);
  if (!user) {
    currentUserKey = '';
    resetStateForUser(null);
    props.services.navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true });
    return;
  }
  if (nextKey !== currentUserKey) {
    currentUserKey = nextKey;
    resetStateForUser(user as { id?: string; uid?: string; callSign?: string });
    if (isEdit.value) void loadCard();
    void loadContestState();
  }
});

onMounted(() => {
  const user = props.services.user() as { id?: string; uid?: string; callSign?: string } | null;
  if (!user) {
    props.services.navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true });
    return;
  }
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('dragover', preventWindowDrop);
  window.addEventListener('drop', preventWindowDrop);

  if (!isEdit.value) {
    callSign.value = user.callSign || '';
  } else {
    void loadCard();
  }
  void loadContestState();
});

onBeforeUnmount(() => {
  active = false;
  generation++;
  imageEpoch++;
  cardController?.abort();
  contestController?.abort();
  submitController?.abort();
  processor.destroy();
  if (leaveResolve) {
    leaveResolve(false);
    leaveResolve = null;
  }
  offLeaveGuard();
  offAuth();
  window.removeEventListener('beforeunload', onBeforeUnload);
  window.removeEventListener('dragover', preventWindowDrop);
  window.removeEventListener('drop', preventWindowDrop);
  for (const timer of Object.values(shakeTimers)) {
    if (timer) window.clearTimeout(timer);
  }
  shakeTimers = {};
});
</script>

<template>
  <div class="f-page f-editor-page container">
    <header class="page-head">
      <p class="eyebrow">{{ isEdit ? 'EDIT QSL CARD' : 'UPLOAD QSL CARD' }}</p>
      <div class="page-head-row">
        <div class="page-head-main">
          <h1 class="page-title">{{ isEdit ? services.t('编辑卡片') : services.t('上传新卡片') }}</h1>
          <p class="page-desc">
            {{ isEdit
              ? services.t('修改卡片信息后需要重新提交审核，审核期间不会出现在卡片广场。')
              : services.t('上传卡片的正反面图片，填写卡片信息；提交后由管理员审核，通过后展示在卡片广场。') }}
          </p>
        </div>
        <div class="page-head-actions">
          <a class="btn btn-ghost" href="/dashboard/cards" data-link>
            <IconVue3 name="arrow-left" :size="16" />
            <span>{{ services.t('返回我的卡片') }}</span>
          </a>
          <button
            v-if="!cardLoadError"
            class="btn btn-primary"
            type="button"
            data-submit
            :disabled="submitDisabled"
            @click="onSubmit"
          >
            <span v-if="submitting || processingCount > 0" class="spinner" aria-hidden="true"></span>
            <IconVue3 v-else name="check" :size="17" />
            <span>{{ submitLabel }}</span>
          </button>
        </div>
      </div>
    </header>

    <div v-if="cardLoadError" class="empty-state" style="margin:6vh auto">
      <div class="empty-state-icon"><IconVue3 name="alert" :size="34" /></div>
      <h2>{{ services.t('卡片加载失败') }}</h2>
      <p>{{ cardLoadError }}</p>
      <div class="f-editor-actions" style="justify-content:center">
        <button v-if="cardLoadRetryable" class="btn btn-primary" type="button" @click="loadCard">
          {{ services.t('重新加载') }}
        </button>
        <a class="btn btn-ghost" href="/dashboard/cards" data-link>{{ services.t('返回我的卡片') }}</a>
      </div>
    </div>

    <template v-else>
      <section v-if="!isEdit" class="f-contest-entry-guide" aria-labelledby="fEditorContestTitle">
        <div class="f-contest-entry-guide-copy">
          <h2 id="fEditorContestTitle">
            <IconVue3 name="trophy" :size="20" />
            {{ services.t('参赛提醒：可在提交卡片时勾选自动参赛') }}
          </h2>
          <p>{{ services.t('想参加第一届 QSLink 杯 QSL 卡片设计大赛？可在下方勾选「审核通过后自动参赛」并填写参赛说明，卡片通过广场审核时将连同说明一起审核并自动参赛；也可以先上传，通过后前往比赛报名页选择 1–2 件作品。每个账号最多 2 件参赛作品。') }}</p>
          <ol>
            <li>{{ services.t('上传卡片并通过广场审核') }}</li>
            <li>{{ services.t('勾选自动参赛并填写说明，或审核通过后手动报名') }}</li>
            <li>{{ services.t('审核通过后自动参赛，或在报名页查看状态') }}</li>
          </ol>
        </div>
        <a class="btn btn-primary" href="/events/qsl-design-2026-11/registration" data-link>
          {{ services.t('比赛报名 / 查看状态') }}
          <IconVue3 name="arrow-right" :size="16" />
        </a>
      </section>

      <div v-if="cardStatusNotice" id="fEditorNotice" class="f-editor-notice" :class="cardStatusNotice.tone">
        <IconVue3 :name="cardStatusNotice.icon" :size="16" />
        <span v-if="cardStatusNotice.kind === 'network'">{{ cardStatusNotice.text }}</span>
        <span v-else-if="cardStatusNotice.kind === 'rejected'">
          <b>{{ services.t('审核未通过') }}</b>
          <template v-if="cardStatusNotice.reason">：{{ cardStatusNotice.reason }}</template>
          <template v-else>。</template>
          {{ ' ' + services.t('请根据提示修改后重新提交审核。') }}
        </span>
        <span v-else-if="cardStatusNotice.kind === 'pending'">
          <b>{{ services.t('这张卡片正在审核中') }}</b>{{ services.t('，修改并提交后会重新进入审核队列。') }}
        </span>
        <span v-else>
          <b>{{ services.t('修改已通过的卡片后需要重新审核') }}</b>{{ services.t('，审核期间不会出现在卡片广场。') }}
        </span>
      </div>

      <div class="f-editor">
        <form class="f-editor-form" id="fEditorForm" @submit.prevent="onSubmit">
          <section class="f-form-card">
            <header class="f-form-card-head">
              <div>
                <h2 class="f-form-card-title">{{ services.t('卡片图片') }}</h2>
                <p class="f-form-card-desc">{{ services.t('正面作为卡片封面，背面用于 3D 翻面展示；支持 PNG / JPG / WebP，单张 ≤ 8MB。选择后立即转为 WebP，最长边不超过 3840 像素，不放大小图；预览和提交均使用处理后的图片，参数显示原始分辨率。') }}</p>
              </div>
              <span class="f-form-step">01</span>
            </header>

            <div class="f-upload-grid">
              <div
                ref="frontZoneRef"
                class="f-upload"
                :class="{
                  'has-image': !!images.front,
                  'is-reading': readingSide.front,
                  'is-dragover': dragSide.front,
                  'is-shake': shakeSide.front,
                }"
                data-upload-side="front"
                tabindex="0"
                role="button"
                :aria-label="services.t('上传卡片正面') + services.t('，点击或拖拽上传')"
                @click="openFilePicker('front')"
                @keydown.enter.prevent="openFilePicker('front')"
                @keydown.space.prevent="openFilePicker('front')"
                @dragenter="onZoneDragOver('front', $event)"
                @dragover="onZoneDragOver('front', $event)"
                @dragleave="onZoneDragLeave('front', $event)"
                @dragend="onZoneDragLeave('front', $event)"
                @drop="onZoneDrop('front', $event)"
              >
                <input
                  ref="frontFileRef"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  data-file
                  @change="onFileInputChange('front', $event)"
                >
                <div class="f-upload-empty" :hidden="!!images.front">
                  <span class="f-upload-ico"><IconVue3 name="image" :size="26" /></span>
                  <b>{{ services.t('上传卡片正面') }}</b>
                  <span class="f-upload-desc">{{ services.t('建议清晰、满幅的扫描或拍摄图') }}</span>
                  <span class="f-upload-hint">{{ services.t('点击选择 · 或拖拽图片到这里 · ≤ 8MB') }}</span>
                </div>
                <div class="f-upload-preview" :hidden="!images.front">
                  <img v-if="images.front" :src="images.front.src" :alt="services.t('上传卡片正面') + services.t('预览')" data-preview-img>
                  <span class="f-upload-meta">
                    <b data-preview-name>{{ zoneLabelText('front') }}</b>
                    <span data-preview-size>{{ zoneMetaText('front') }}</span>
                  </span>
                  <span class="f-upload-replace"><IconVue3 name="refresh" :size="14" /> {{ services.t('点击替换') }}</span>
                </div>
                <span class="f-upload-loading"><span class="spinner"></span><span>{{ services.t('正在上传…') }}</span></span>
              </div>

              <div
                ref="backZoneRef"
                class="f-upload"
                :class="{
                  'has-image': !!images.back,
                  'is-reading': readingSide.back,
                  'is-dragover': dragSide.back,
                  'is-shake': shakeSide.back,
                }"
                data-upload-side="back"
                tabindex="0"
                role="button"
                :aria-label="services.t('上传卡片背面') + services.t('，点击或拖拽上传')"
                @click="openFilePicker('back')"
                @keydown.enter.prevent="openFilePicker('back')"
                @keydown.space.prevent="openFilePicker('back')"
                @dragenter="onZoneDragOver('back', $event)"
                @dragover="onZoneDragOver('back', $event)"
                @dragleave="onZoneDragLeave('back', $event)"
                @dragend="onZoneDragLeave('back', $event)"
                @drop="onZoneDrop('back', $event)"
              >
                <input
                  ref="backFileRef"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  data-file
                  @change="onFileInputChange('back', $event)"
                >
                <div class="f-upload-empty" :hidden="!!images.back">
                  <span class="f-upload-ico"><IconVue3 name="image" :size="26" /></span>
                  <b>{{ services.t('上传卡片背面') }}</b>
                  <span class="f-upload-desc">{{ services.t('可留空，3D 预览将显示精美占位') }}</span>
                  <span class="f-upload-hint">{{ services.t('点击选择 · 或拖拽图片到这里 · ≤ 8MB') }}</span>
                </div>
                <div class="f-upload-preview" :hidden="!images.back">
                  <img v-if="images.back" :src="images.back.src" :alt="services.t('上传卡片背面') + services.t('预览')" data-preview-img>
                  <span class="f-upload-meta">
                    <b data-preview-name>{{ zoneLabelText('back') }}</b>
                    <span data-preview-size>{{ zoneMetaText('back') }}</span>
                  </span>
                  <span class="f-upload-replace"><IconVue3 name="refresh" :size="14" /> {{ services.t('点击替换') }}</span>
                </div>
                <span class="f-upload-loading"><span class="spinner"></span><span>{{ services.t('正在上传…') }}</span></span>
              </div>
            </div>
          </section>

          <section class="f-form-card">
            <header class="f-form-card-head">
              <div>
                <h2 class="f-form-card-title">{{ services.t('卡片信息') }}</h2>
                <p class="f-form-card-desc">{{ services.t('为卡片取一个名字、署上呼号，再写一段背后的故事。') }}</p>
              </div>
              <span class="f-form-step">02</span>
            </header>
            <div class="f-form-grid">
              <div class="f-field f-span-2" :class="{ 'has-error': !!fieldErrors.title }" data-field="title">
                <div class="f-field-row">
                  <label class="label" for="fCardTitle">{{ services.t('卡片标题') }}<i class="req">*</i></label>
                  <span class="f-label-hint" data-counter="title">{{ titleCount }} / {{ CARD_LIMITS_VUE3.title }}</span>
                </div>
                <input
                  id="fCardTitle"
                  ref="titleInputRef"
                  v-model="title"
                  class="input"
                  name="title"
                  type="text"
                  :disabled="loadingCard || submitting"
                  :placeholder="services.t('例如：雪线之上的守候')"
                  autocomplete="off"
                  @input="fieldErrors.title = undefined; markDirty()"
                >
                <p v-if="fieldErrors.title" class="f-error" data-error="title" role="alert">{{ fieldErrors.title }}</p>
              </div>

              <div class="f-field f-span-2" :class="{ 'has-error': !!fieldErrors.callSign }" data-field="callSign">
                <label class="label" for="fCardCallSign">{{ services.t('呼号') }}</label>
                <input
                  id="fCardCallSign"
                  ref="callSignInputRef"
                  :value="callSign"
                  class="input"
                  name="callSign"
                  type="text"
                  :disabled="loadingCard || submitting"
                  autocomplete="off"
                  @input="onCallSignInput"
                >
                <p v-if="fieldErrors.callSign" class="f-error" data-error="callSign" role="alert">{{ fieldErrors.callSign }}</p>
              </div>

              <div class="f-field f-span-2" :class="{ 'has-error': !!fieldErrors.notes }" data-field="notes">
                <div class="f-field-row">
                  <label class="label" for="fCardNotes">{{ services.t('卡片简介') }}<span class="f-optional">{{ services.t('选填') }}</span></label>
                  <span class="f-label-hint" data-counter="notes">{{ notesCount }} / {{ CARD_LIMITS_VUE3.notes }}</span>
                </div>
                <textarea
                  id="fCardNotes"
                  ref="notesInputRef"
                  v-model="notes"
                  class="textarea"
                  name="notes"
                  rows="4"
                  :disabled="loadingCard || submitting"
                  :placeholder="services.t('记录这张卡片背后的通联故事，例如：海拔 4500 米的通联纪念。')"
                  @input="fieldErrors.notes = undefined; markDirty()"
                ></textarea>
                <p v-if="fieldErrors.notes" class="f-error" data-error="notes" role="alert">{{ fieldErrors.notes }}</p>
              </div>

              <div class="f-field f-span-2" :class="{ 'has-error': !!fieldErrors.stock }" data-field="stock">
                <label class="label" for="fCardStock">{{ services.t('卡片库存') }}<span class="f-optional">{{ services.t('选填') }}</span></label>
                <button
                  v-if="isEdit"
                  id="fCardStock"
                  class="input f-stock-trigger"
                  type="button"
                  aria-haspopup="dialog"
                  :aria-label="services.t('调整卡片库存')"
                  :disabled="loadingCard || submitting || !editorCard"
                  @click="editorCard && (stockModalOpen = true)"
                >
                  <span v-if="!editorCard">{{ services.t('加载中…') }}</span>
                  <span v-else-if="editorCard.stock == null">{{ services.t('未设置（不限制换卡）') }}</span>
                  <span v-else>{{ editorCard.stock }} {{ services.t('张') }}</span>
                  <IconVue3 name="edit" :size="16" />
                </button>
                <input
                  v-else
                  id="fCardStock"
                  ref="stockInputRef"
                  v-model="stockText"
                  class="input"
                  name="stock"
                  type="number"
                  min="0"
                  max="2147483647"
                  step="1"
                  :disabled="submitting"
                  :placeholder="services.t('未设置')"
                  @input="fieldErrors.stock = undefined; markDirty()"
                >
                <p class="hint">
                  {{ isEdit
                    ? services.t('点击库存框打开调整弹窗，单独保存，无需重新审核。')
                    : services.t('留空不限制换卡；填 0 暂停换卡。同意一笔申请自动扣减 1 张。') }}
                </p>
                <p v-if="fieldErrors.stock" class="f-error" data-error="stock" role="alert">{{ fieldErrors.stock }}</p>
              </div>
            </div>
          </section>

          <section class="f-form-card">
            <header class="f-form-card-head">
              <div>
                <h2 class="f-form-card-title">{{ services.t('卡片比例') }}</h2>
                <p class="f-form-card-desc">{{ services.t('决定 3D 预览与卡片广场中的展示比例，可选预设或自定义宽高整数。') }}</p>
              </div>
              <span class="f-form-step">03</span>
            </header>
            <div class="f-ratio-chips" data-ratio-chips>
              <button
                v-for="preset in RATIO_PRESETS_VUE3"
                :key="preset.label"
                class="f-ratio-chip"
                :class="{ 'is-active': ratio.w === preset.w && ratio.h === preset.h }"
                type="button"
                :data-ratio="preset.w + 'x' + preset.h"
                :disabled="loadingCard || submitting"
                @click="applyPresetRatio(preset.w, preset.h)"
              >
                <span class="f-ratio-shape" :style="{ aspectRatio: preset.w + ' / ' + preset.h }"></span>
                <span class="f-ratio-text"><b>{{ preset.label }}</b><small>{{ services.t(preset.desc) }}</small></span>
              </button>
            </div>
            <div class="f-ratio-custom">
              <label class="f-ratio-input">
                <span class="label">{{ services.t('宽') }}</span>
                <input
                  id="fRatioW"
                  v-model="ratioWText"
                  class="input"
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  inputmode="numeric"
                  name="ratioW"
                  :disabled="loadingCard || submitting"
                  @input="onRatioInput"
                  @blur="onRatioBlur"
                >
              </label>
              <span class="f-ratio-colon">:</span>
              <label class="f-ratio-input">
                <span class="label">{{ services.t('高') }}</span>
                <input
                  id="fRatioH"
                  v-model="ratioHText"
                  class="input"
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  inputmode="numeric"
                  name="ratioH"
                  :disabled="loadingCard || submitting"
                  @input="onRatioInput"
                  @blur="onRatioBlur"
                >
              </label>
              <span class="f-ratio-preview-label" data-ratio-label>{{ ratio.w }} : {{ ratio.h }} · {{ ratioDirectionText }}</span>
            </div>
            <p v-if="fieldErrors.ratio" class="f-error" data-error="ratio" role="alert">{{ fieldErrors.ratio }}</p>
            <p class="f-form-tip">
              <IconVue3 name="info" :size="14" />
              {{ services.t('宽高取值 1 - 1000 的整数；横版卡片推荐 3:2，竖版推荐 2:3。') }}
            </p>
          </section>

          <div class="f-form-card">
            <label class="f-consent">
              <input
                ref="consentInputRef"
                v-model="contentConsent"
                type="checkbox"
                name="contentConsent"
                :disabled="loadingCard || submitting"
                @change="fieldErrors.consent = undefined"
              >
              <span>
                {{ services.t('我确认拥有本次卡片内容的必要权利，同意') }}
                <a href="/legal/terms.html" target="_blank" rel="noopener">{{ services.t('用户条款及其中的内容授权') }}</a>
                {{ services.t('，并已阅读') }}
                <a href="/legal/privacy.html" target="_blank" rel="noopener">{{ services.t('隐私说明') }}</a>
                {{ services.t('。审核通过后卡片将公开展示，图片通过公开链接提供，请勿包含私人收件地址或电话。') }}
              </span>
            </label>
            <p v-if="fieldErrors.consent" class="f-error" data-consent-error role="alert">{{ fieldErrors.consent }}</p>
          </div>

          <div class="f-form-card f-contest-auto" data-contest-auto>
            <label class="f-consent f-contest-auto-toggle">
              <input
                type="checkbox"
                name="contestOptIn"
                data-contest-optin
                :checked="contestOptIn"
                :disabled="loadingCard || submitting || (contestLimitReached && !contestOptIn)"
                @change="onContestCheckboxChange"
              >
              <span>
                <b>{{ services.t('审核通过后自动参赛') }}</b>
                <span class="f-contest-auto-copy">{{ services.t('勾选后填写参赛说明；参赛说明与卡片一起审核，通过后自动进入第一届 QSLink 杯 QSL 卡片设计大赛。每个账号最多 2 件参赛作品。') }}</span>
              </span>
            </label>

            <div class="f-contest-auto-body" data-contest-auto-body :hidden="!contestOptIn">
              <p class="hint" data-contest-auto-status role="status">{{ contestStatusText }}</p>
              <div v-if="contestOptIn && contestDescription.trim()" class="f-contest-auto-preview" data-contest-preview>
                {{ contestDescription.trim() }}
              </div>
              <button class="btn btn-soft btn-sm" type="button" data-contest-description-edit :disabled="loadingCard || submitting" @click="openContestModal">
                <IconVue3 name="edit" :size="15" />
                <span>{{ services.t('编辑参赛说明') }}</span>
              </button>
            </div>

            <p v-if="contestLimitReached" class="hint" data-contest-limit>
              {{ services.t('你的参赛作品已达 2 件（含比赛报名中的作品），无法再自动参赛；如需更换，请前往比赛报名调整。') }}
              <a href="/events/qsl-design-2026-11/registration" data-link>{{ services.t('比赛报名 / 查看状态') }}</a>
            </p>
            <p v-else-if="contestLoadFailed" class="hint" data-contest-retry-hint>
              <button class="btn btn-ghost btn-sm" type="button" @click="loadContestState">{{ services.t('重新检查参赛名额') }}</button>
            </p>
            <p v-if="fieldErrors.contest" class="f-error" data-contest-error role="alert">{{ fieldErrors.contest }}</p>
          </div>

          <div class="f-editor-actions">
            <a class="btn btn-ghost" href="/dashboard/cards" data-link>{{ services.t('取消') }}</a>
            <span v-if="dirty" class="f-unsaved" data-unsaved>
              <IconVue3 name="alert" :size="14" />
              {{ services.t('有未保存的修改') }}
            </span>
            <button class="btn btn-primary btn-lg" type="button" data-submit :disabled="submitDisabled" @click="onSubmit">
              <span v-if="submitting || processingCount > 0" class="spinner" aria-hidden="true"></span>
              <IconVue3 v-else name="check" :size="18" />
              <span>{{ submitLabel }}</span>
            </button>
          </div>
        </form>

        <aside class="f-editor-preview">
          <div class="f-preview-panel glass">
            <header class="f-preview-head">
              <div>
                <h2 class="f-preview-title">{{ services.t('实时预览') }}</h2>
                <p class="f-preview-sub">{{ services.t('拖动旋转 · 双击翻面') }}</p>
              </div>
              <span class="f-preview-live"><i></i> LIVE</span>
            </header>

            <div class="f-preview-stage" :class="{ 'is-3d': !!services.createViewer }" id="fPreviewStage">
              <Card3DViewerVue3
                :front="images.front ? images.front.src : null"
                :back="images.back ? images.back.src : null"
                :ratio="ratio"
                :create="services.createViewer"
                :options="viewerOptions"
              >
                <template #fallback>
                  <div class="f-preview-fallback">
                    <div class="f-preview-fallback-card" :style="{ aspectRatio: ratio.w + ' / ' + ratio.h }">
                      <img v-if="images.front" :src="images.front.src" :alt="services.t('卡片正面预览')">
                      <span v-else class="f-preview-fallback-empty">
                        <IconVue3 name="3d" :size="30" />
                        <b>{{ services.t('3D 预览') }}</b>
                        <span>{{ services.t('上传正面图片后显示') }}</span>
                      </span>
                      <span class="f-preview-fallback-badge">
                        <IconVue3 name="3d" :size="13" />
                        {{ services.t('预览占位') }}
                      </span>
                    </div>
                    <p class="f-preview-fallback-tip">
                      <IconVue3 name="info" :size="14" />
                      {{ services.t('3D 预览模块准备中，上传的图片仍会正常保存。') }}
                    </p>
                  </div>
                </template>
              </Card3DViewerVue3>
            </div>

            <div class="f-preview-meta">
              <span class="f-preview-ratio" data-preview-ratio>{{ ratioSummaryText }}</span>
              <span class="f-preview-sides" :class="{ 'is-ready': !!images.front }" data-preview-sides>{{ previewSidesText }}</span>
            </div>

            <button class="btn btn-primary btn-block f-preview-submit" type="button" data-submit :disabled="submitDisabled" @click="onSubmit">
              <span v-if="submitting || processingCount > 0" class="spinner" aria-hidden="true"></span>
              <IconVue3 v-else name="upload" :size="17" />
              <span>{{ submitLabel }}</span>
            </button>

            <ul class="f-preview-tips">
              <li><IconVue3 name="check" :size="14" /> {{ services.t('图片与比例变化会实时同步到 3D 预览') }}</li>
              <li><IconVue3 name="check" :size="14" /> {{ services.t('提交后进入人工审核，通过后展示在广场') }}</li>
              <li><IconVue3 name="check" :size="14" /> {{ services.t('背面留空时，3D 卡片背面显示占位图案') }}</li>
            </ul>
          </div>
        </aside>
      </div>
    </template>

    <CardStockDialogVue3
      v-if="stockModalOpen && editorCard"
      :card="editorCard"
      :services="services"
      @close="stockModalOpen = false"
      @saved="onStockSaved"
    />

    <DialogVue3
      v-if="contestModalOpen"
      :title="services.t('参赛说明')"
      :t="services.t"
      size="md"
      @close="closeContestModal"
    >
      <div class="f-contest-auto-editor">
        <label class="field">
          <span class="label">{{ services.t('参赛说明') }}<i class="req">*</i></span>
          <textarea
            ref="contestTextRef"
            v-model="contestDraft"
            class="textarea"
            rows="8"
            required
            data-contest-text
            aria-describedby="contest-auto-hint contest-auto-count contest-auto-error"
            :aria-invalid="contestModalError ? 'true' : undefined"
            @input="contestModalError = ''"
          ></textarea>
        </label>
        <p class="hint" id="contest-auto-hint">{{ services.t('请填写 1–2000 字参赛说明。说明将与卡片一起审核，通过后公开展示。') }}</p>
        <p class="hint" :class="{ 'is-invalid': contestDraftCount > CARD_LIMITS_VUE3.contestDescription }" id="contest-auto-count" data-contest-count role="status">
          {{ services.t('{n} / 2000 字', { n: contestDraftCount }) }}
        </p>
        <p v-if="contestModalError" class="f-modal-error" id="contest-auto-error" data-contest-modal-error role="alert">
          {{ contestModalError }}
        </p>
      </div>
      <template #actions>
        <button class="btn btn-ghost" type="button" @click="closeContestModal">{{ services.t('取消') }}</button>
        <button class="btn btn-primary" type="button" data-contest-save @click="saveContestModal">{{ services.t('保存说明') }}</button>
      </template>
    </DialogVue3>

    <DialogVue3
      v-if="leaveConfirmOpen"
      :title="services.t('离开此页面？')"
      :t="services.t"
      size="sm"
      @close="resolveLeave(false)"
    >
      <p>{{ services.t('你还有未保存的卡片内容，离开后本次修改将丢失。') }}</p>
      <template #actions>
        <button class="btn btn-ghost" type="button" @click="resolveLeave(false)">{{ services.t('继续编辑') }}</button>
        <button class="btn btn-danger" type="button" data-leave-confirm @click="resolveLeave(true)">{{ services.t('放弃修改并离开') }}</button>
      </template>
    </DialogVue3>
  </div>
</template>
