<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ name: string }>();
const paths: Record<string, string> = {
  power: "M12 2v10 M5 5a9 9 0 1 0 14 0",
  banana: "M18 3c1 8-3 13-11 13l-4-1c2 7 11 8 16 1 3-5 2-9-1-13Z M17 4l1-2",
  gun: "M3 7h18v6H10l-2 8H3l2-9H3V7Z M13 13v3h4l1-3",
  person: "M8 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M4 22v-4a8 8 0 0 1 16 0v4",
  sound: "M3 9h4l5-5v16l-5-5H3V9Z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14",
  exit: "M9 3H3v18h6 M8 12h13 M16 7l5 5-5 5",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  shield: "M12 2l8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3Z",
  link: "M9 15l6-6 M8 10l-3 3a4 4 0 0 0 6 6l3-3 M10 8l3-3a4 4 0 0 1 6 6l-3 3",
  reload: "M20 7V2l-3 3a8 8 0 1 0 3 11 M15 7h5",
};
const d = computed(() => paths[props.name] ?? paths.shield);
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="d" />
  </svg>
</template>
