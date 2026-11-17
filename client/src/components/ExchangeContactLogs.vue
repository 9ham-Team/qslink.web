<script setup lang="ts">
import IconVue3 from './Icon.vue';
import type { ContactLogSummaryVue3 } from '../contracts';
import { formatContactLogPairsVue3 } from '../exchange-utils';

defineProps<{
  logs?: ContactLogSummaryVue3[];
  direction?: string;
  t: (source: string) => string;
}>();
</script>

<template>
  <details v-if="logs && logs.length" class="f-ex-submitted-logs">
    <summary>
      <IconVue3 name="clock" :size="15" />
      {{ direction === 'incoming' ? t('申请人附上的通联记录') : t('本次申请附上的通联记录') }}（{{ logs.length }} {{ t('条）') }}
    </summary>
    <p class="muted">{{ t('由申请人自主选择，请自行核对。') }}</p>
    <ol>
      <li v-for="(logRow, idx) in logs" :key="logRow.id || idx">
        <span class="f-ex-log-record">
          <span v-for="[k, v] in formatContactLogPairsVue3(logRow, t)" :key="k"><b>{{ k }}</b> {{ v }}</span>
          <span>{{ t('LoTW 确认：') }}{{ logRow.lotwConfirmed ? t('是') : t('否') }}</span>
        </span>
      </li>
    </ol>
  </details>
</template>
