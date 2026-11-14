<script setup lang="ts">
export type IconNameVue3 =
  | 'search'
  | 'x'
  | 'close'
  | 'refresh'
  | 'chevron-down'
  | 'arrow-right'
  | 'grid'
  | 'check-circle'
  | '3d'
  | 'heart'
  | 'user'
  | 'sparkles'
  | 'send'
  | 'shield'
  | 'share'
  | 'info'
  | 'alert'
  | 'cards'
  | 'edit'
  | 'clock'
  | 'lock'
  | 'globe'
  | 'copy'
  | 'mail'
  | 'eye'
  | 'radio'
  | 'antenna'
  | 'sun'
  | 'moon'
  | 'check'
  | 'inbox'
  | 'settings'
  | 'star'
  | 'compass'
  | 'calendar'
  | 'upload'
  | 'map-pin'
  | 'key'
  | 'chevron-right'
  | 'trophy'
  | 'trash'
  | 'arrow-left'
  | 'external'
  | 'image'
  | 'plus'
  | 'layout'
  | 'list'
  | 'logout'
  | 'menu'
  | 'log-in';

withDefaults(defineProps<{ name: IconNameVue3; size?: number }>(), { size: 18 });
</script>

<template>
  <svg class="icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'search'"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></template>
    <path v-else-if="name === 'x' || name === 'close'" d="M18 6 6 18M6 6l12 12" />
    <template v-else-if="name === 'refresh'"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 2M4 16l2 2a7 7 0 0 0 12-1" /></template>
    <path v-else-if="name === 'chevron-down'" d="m6 9 6 6 6-6" />
    <path v-else-if="name === 'arrow-right'" d="M5 12h14M13 6l6 6-6 6" />
    <template v-else-if="name === 'grid'"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></template>
    <template v-else-if="name === 'check-circle'"><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.4 2.4 4.8-5" /></template>
    <template v-else-if="name === '3d'"><path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" /><path d="M12 12l8-4.6M12 12v9.2M12 12L4 7.4" /></template>
    <path v-else-if="name === 'heart'" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" />
    <template v-else-if="name === 'user'"><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></template>
    <template v-else-if="name === 'sparkles'"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></template>
    <template v-else-if="name === 'send'"><path d="M21 3L10.5 13.5" /><path d="M21 3l-7 18-3.5-7.5L3 10z" /></template>
    <template v-else-if="name === 'shield'"><path d="M12 3l7 3v5.5c0 4.4-2.9 7.7-7 9.5-4.1-1.8-7-5.1-7-9.5V6z" /><path d="M9.2 12.2l2 2 3.8-4" /></template>
    <template v-else-if="name === 'share'"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.6l6.8-4.2M8.6 13.4l6.8 4.2" /></template>
    <template v-else-if="name === 'info'"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.5" /></template>
    <template v-else-if="name === 'alert'"><path d="M12 4L2.8 20h18.4z" /><path d="M12 10v4.5M12 17.6v.4" /></template>
    <template v-else-if="name === 'cards'"><rect x="3" y="6" width="14" height="10" rx="2.5" /><path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3H19a2 2 0 0 1 2 2v9.5a1.5 1.5 0 0 1-1.5 1.5H18" /></template>
    <template v-else-if="name === 'edit'"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></template>
    <template v-else-if="name === 'lock'"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" /></template>
    <template v-else-if="name === 'globe'"><circle cx="12" cy="12" r="9" /><path d="M3.5 9.5h17M3.5 14.5h17" /><path d="M12 3c2.6 2.4 4 5.5 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.5-4-9s1.4-6.6 4-9z" /></template>
    <template v-else-if="name === 'copy'"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" /></template>
    <template v-else-if="name === 'mail'"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l7.4 5.6a2 2 0 0 0 2.2 0L20.5 7" /></template>
    <template v-else-if="name === 'eye'"><path d="M1.8 12S5.6 5.3 12 5.3 22.2 12 22.2 12 18.4 18.7 12 18.7 1.8 12 1.8 12z" /><circle cx="12" cy="12" r="3.2" /></template>
    <template v-else-if="name === 'radio'"><circle cx="12" cy="12" r="2" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 16.5a6.4 6.4 0 0 0 0-9M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 19.5a10.6 10.6 0 0 0 0-15" /></template>
    <template v-else-if="name === 'antenna'"><path d="M12 21V10" /><path d="M8 13a5.6 5.6 0 0 1 8 0" /><path d="M5 10a10 10 0 0 1 14 0" /><circle cx="12" cy="6.5" r="1.4" /></template>
    <template v-else-if="name === 'sun'"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M4.3 4.3l1.4 1.4M18.3 18.3l1.4 1.4M2.5 12h2M19.5 12h2M4.3 19.7l1.4-1.4M18.3 5.7l1.4-1.4" /></template>
    <path v-else-if="name === 'moon'" d="M20.5 14.5A8.6 8.6 0 0 1 9.5 3.5a8.6 8.6 0 1 0 11 11z" />
    <path v-else-if="name === 'check'" d="M20 6L9 17l-5-5" />
    <template v-else-if="name === 'inbox'"><path d="M4.5 4.5h15L21 13a2 2 0 0 1-2 2h-3l-1.5 3h-5L8 15H5a2 2 0 0 1-2-2z" /><path d="M4.5 4.5L3 11" /></template>
    <template v-else-if="name === 'settings'"><circle cx="12" cy="12" r="3" /><path d="M19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.5 2.7a7.5 7.5 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 2 1.2l.5 2.7h5l.5-2.7a7.5 7.5 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></template>
    <path v-else-if="name === 'star'" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.9l-5.3 2.7 1.1-5.8-4.3-4.1 5.9-.8z" />
    <template v-else-if="name === 'compass'"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></template>
    <template v-else-if="name === 'calendar'"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M3.5 9h17M8 3v3M16 3v3" /></template>
    <template v-else-if="name === 'upload'"><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></template>
    <template v-else-if="name === 'map-pin'"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></template>
    <template v-else-if="name === 'key'"><circle cx="8" cy="15.5" r="4" /><path d="M11 12.5L20 3.5M17 6.5l2.5 2.5M14.5 9l2 2" /></template>
    <path v-else-if="name === 'chevron-right'" d="M9 6l6 6-6 6" />
    <template v-else-if="name === 'trophy'"><path d="M8 3h8v5a4 4 0 0 1-8 0z" /><path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6v4" /></template>
    <template v-else-if="name === 'trash'"><path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6M5.5 6l1 13a2 2 0 0 0 2 1.9h7a2 2 0 0 0 2-1.9l1-13" /><path d="M10 11v5M14 11v5" /></template>
    <template v-else-if="name === 'arrow-left'"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></template>
    <template v-else-if="name === 'external'"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4.5A2.5 2.5 0 0 1 15.5 21h-9A2.5 2.5 0 0 1 4 18.5v-9A2.5 2.5 0 0 1 6.5 7H11" /></template>
    <template v-else-if="name === 'image'"><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="M3.5 17l4.8-4.6a2 2 0 0 1 2.8.1L21 20" /></template>
    <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" />
    <template v-else-if="name === 'layout'"><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M3 9h18M9 9v12" /></template>
    <path v-else-if="name === 'list'" d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    <template v-else-if="name === 'logout'"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8l-4 4 4 4M6 12h10" /></template>
    <path v-else-if="name === 'menu'" d="M4 7h16M4 12h16M4 17h16" />
    <template v-else-if="name === 'log-in'"><path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" /><path d="M10 8l4 4-4 4M3 12h11" /></template>
  </svg>
</template>
