<template>
  <transition name="fade">
    <div v-if="isVisible" class="splash-screen">
      <div class="splash-content">
        <img src="@/assets/logo.svg" alt="Logo" />
        <h1>Bienvenido</h1>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { useSplashStore } from '@/stores/splash'
import { computed } from 'vue'

const splashStore = useSplashStore()
const isVisible = computed(() => splashStore.isVisible)
</script>

<style scoped>
h1 {
  color: var(--brand-blue);
}
h1 span {
  color: var(--brand-green);
}

.splash-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--background-light);
  color: var(--text-black);
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
