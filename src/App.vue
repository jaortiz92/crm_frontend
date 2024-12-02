<script setup>
import { RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import SplashScreen from '@/components/SplashScreen.vue'
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
