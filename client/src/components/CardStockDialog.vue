<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import DialogVue3 from './Dialog.vue';
import type { CardManageServicesVue3, MyCardItemVue3 } from '../contracts';
import { cardUserKeyVue3, parseStockInputVue3 } from '../card-manage-utils';

const props = defineProps<{
  card: MyCardItemVue3;
  services: CardManageServicesVue3;
}>();

const emit = defineEmits<{
  close: [];
  saved: [card: MyCardItemVue3];
}>();

const stockText = ref(props.card.stock == null ? '' : String(props.card.stock));
const error = ref('');
const busy = ref(false);
const inputRef = ref<HTMLInputElement>();

let active = true;
let generation = 0;
let controller: AbortController | null = null;
const initialUserKey = cardUserKeyVue3(props.services.user());

const offAuth = props.services.onAuth(user => {
  const nextKey = cardUserKeyVue3(user);
  if (nextKey !== initialUserKey) {
    generation++;
    controller?.abort();
    controller = null;
    busy.value = false;
    emit('close');
  }
});

onBeforeUnmount(() => {
  active = false;
  generation++;
  controller?.abort();
  controller = null;
  offAuth();
});

function close() {
  if (busy.value) return;
  emit('close');
}

async function submit() {
  if (busy.value) return;
  error.value = '';
  const parsed = parseStockInputVue3(stockText.value, !!inputRef.value?.validity?.badInput);
  if (!parsed.ok) {
    error.value = props.services.t('请输入 0–2147483647 的整数，或留空');
    inputRef.value?.focus();
    return;
  }

  busy.value = true;
  const reqGen = ++generation;
  controller?.abort();
  const abort = new AbortController();
  controller = abort;

  try {
    const result = await props.services.updateCardStock(props.card.id, parsed.value, abort.signal);
    if (!active || reqGen !== generation || cardUserKeyVue3(props.services.user()) !== initialUserKey) return;
    const updatedCard: MyCardItemVue3 = {
      ...props.card,
      ...(result && result.card ? result.card : { stock: parsed.value }),
    };
    props.services.toast(props.services.t('库存已更新'), 'success');
    emit('saved', updatedCard);
    emit('close');
  } catch (err) {
    if (!active || reqGen !== generation || abort.signal.aborted) return;
    const apiErr = err as { fields?: Record<string, string>; message?: string };
    const rawMsg = (apiErr.fields && apiErr.fields.stock) || apiErr.message || '保存失败，请重试';
    error.value = props.services.i18nError(rawMsg);
  } finally {
    if (controller === abort) controller = null;
    if (active && reqGen === generation) busy.value = false;
  }
}
</script>

<template>
  <DialogVue3 :title="services.t('调整卡片库存')" :t="services.t" :busy="busy" size="sm" @close="close">
    <p>{{ card.title || services.t('未命名卡片') }}</p>
    <label class="field">
      <span class="label">{{ services.t('库存（张）') }}</span>
      <input
        ref="inputRef"
        v-model="stockText"
        class="input"
        type="number"
        min="0"
        max="2147483647"
        step="1"
        data-stock
        :disabled="busy"
        :placeholder="services.t('未设置')"
        :aria-invalid="error ? 'true' : undefined"
        @input="error = ''"
        @keydown.enter.prevent="submit"
      >
    </label>
    <p class="hint">{{ services.t('留空不限制换卡；填 0 暂停换卡。同意申请时自动扣减 1 张。此处保存为新的剩余库存，不影响审核状态。') }}</p>
    <p v-if="error" class="f-error" role="alert" data-stock-error>{{ error }}</p>
    <template #actions>
      <button class="btn btn-ghost" type="button" :disabled="busy" @click="close">{{ services.t('取消') }}</button>
      <button class="btn btn-primary" type="button" :disabled="busy" data-stock-save @click="submit">{{ services.t('保存库存') }}</button>
    </template>
  </DialogVue3>
</template>
