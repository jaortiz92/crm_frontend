<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { alertService } from '@/services/alertService'

const username = ref('')
const password = ref('')
const userStore = useUserStore()
const router = useRouter()

const submitLogin = async () => {
  try {
    await userStore.login(username.value, password.value)
    router.push({ name: 'Home' })
  } catch (error) {
    alertService.generalError('Usuario o contraseña incorrectos')
  }
}
</script>

<template>
  <div class="login-container">
    <h1>Iniciar sesión</h1>
    <form @submit.prevent="submitLogin">
      <label for="username">Usuario:</label>
      <input type="text" v-model="username" required />

      <label for="password">Contraseña:</label>
      <input type="password" v-model="password" required />

      <button type="submit">Iniciar sesión</button>
    </form>
  </div>
</template>

<style scoped></style>
