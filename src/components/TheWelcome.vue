<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

const userStore = useUserStore()
const first_name = ref('')
const last_name = ref('')

const addDataUser = async () => {
  first_name.value = await userStore.user.first_name
  last_name.value = await userStore.user.last_name
}
addDataUser()
</script>

<template>
  <div>
    <h3>Bienvenido {{ first_name }} {{ last_name }}</h3>
  </div>
</template>
