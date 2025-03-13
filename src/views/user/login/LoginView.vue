<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { alertService } from '@/services/alertService'

const loingdata = ref({
  username: null,
  password: null
})
const userStore = useUserStore()
const router = useRouter()

const submitLogin = async () => {
  try {
    await userStore.login(loingdata.value)
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
      <input type="text" v-model="loingdata.username" required />

      <label for="password">Contraseña:</label>
      <input type="password" v-model="loingdata.password" required />

      <button type="submit">Iniciar sesión</button>
    </form>
  </div>
  <router-link :to="{ name: 'RestorePassword' }">Olvide mi contraseña</router-link>
</template>

<style scoped>
input {
  width: 95%;
  min-width: none;
  max-width: none;
}

form {
  background-color: var(--background-light);
}
</style>
