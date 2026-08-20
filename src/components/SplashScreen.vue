<template>
  <transition name="fade">
    <div v-if="isVisible" class="splash-screen">
      <div class="splash-content">
        <img :src="logoSrc" alt="Logo" />
        <h1>Bienvenido</h1>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { useSplashStore } from '@/stores/splash'
import { computed } from 'vue'
import { useThemeStore } from '@/stores/themeStore'
import logoLight from '@/assets/logo.svg'
import logoDark from '@/assets/logo-dark.svg'

const splashStore = useSplashStore()
const isVisible = computed(() => splashStore.isVisible)
const themeStore = useThemeStore()
const logoSrc = computed(() => (themeStore.isDark ? logoDark : logoLight))

</script>

<style scoped>
h1 {
  color: var(--color-brand, #03658c);
}
h1 span {
  color: var(--color-success, #499a67);
}

.splash-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.splash-content {
  text-align: center;
  width: 50%;
  height: 50%;
}

.fade-leave-active {
  transition: opacity 0.8s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
