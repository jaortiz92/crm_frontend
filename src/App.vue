<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import SplashScreen from '@/components/SplashScreen.vue'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()

onMounted(() => {
  themeStore.initTheme()
})

onUnmounted(() => {
  themeStore.destroy()
})
</script>

<template>
  <SplashScreen />
  <header>
    <div>
      <NavBar></NavBar>
    </div>
  </header>
  <RouterView />
</template>

<style></style>
