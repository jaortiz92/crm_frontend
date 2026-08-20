<script setup>
import { useThemeStore } from '@/stores/themeStore'
import { computed } from 'vue'

const themeStore = useThemeStore()

const isDark = computed(() => themeStore.isDark)

const toggle = () => {
  themeStore.toggleTheme()
}
</script>

<template>
  <button
    class="theme-toggle"
    role="switch"
    :aria-checked="isDark"
    aria-label="Alternar modo oscuro"
    @click="toggle"
  >
    <span class="toggle-track" :class="{ 'track-dark': isDark }">
      <span class="toggle-thumb" :class="{ 'thumb-dark': isDark }">
        <svg
          v-show="!isDark"
          class="toggle-icon icon-sun"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        <svg
          v-show="isDark"
          class="toggle-icon icon-moon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
    </span>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
  color: inherit;
  font-weight: normal;
  min-width: auto;
  max-width: none;
  margin: 0;
}

.theme-toggle:hover {
  background-color: none;
}

.toggle-track {
  display: flex;
  align-items: center;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  padding: 2px;
  background-color: #d1d5db;
  transition: background-color 0.3s ease;
  position: relative;
}

.toggle-track.track-dark {
  background-color: var(--color-brand, #03658c);
}

.toggle-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #ffffff;
  transition: transform 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-thumb.thumb-dark {
  transform: translateX(20px);
  background-color: #1e293b;
}

.toggle-icon {
  width: 12px;
  height: 12px;
}

.icon-sun {
  color: #f59e0b;
}

.icon-moon {
  color: #a5b4fc;
}
</style>
