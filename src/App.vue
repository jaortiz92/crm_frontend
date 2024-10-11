<script setup>
import { RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
</script>

<template>
  <header>
    <div>
      <NavBar></NavBar>
    </div>
  </header>
  <RouterView />
</template>

<style></style>
