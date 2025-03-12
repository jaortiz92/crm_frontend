<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { alertService } from '@/services/alertService'
import { userService } from '@/services/userService'

const route = useRoute()
const router = useRouter()
const data = ref({
  token: route.params.token,
  new_password: null,
  new_password_try: null
})

const submitResetPassword = async () => {
  if (data.value.new_password === data.value.new_password_try) {
    try {
      await userService.resetPassword(data.value)
      alertService.generalSucces('Contraseñas actualizada')
      router.push({ name: 'Login' })
    } catch (error) {
      alertService.generalError('Contraseñas no se pudo cambiar')
    }
  } else {
    alertService.generalError('Contraseñas no coinsiden')
  }
}
</script>

<template>
  <div class="login-container">
    <h3>Inserte los datos para rescuperar la contraseña</h3>
    <form @submit.prevent="submitResetPassword">
      <label>Nueva Contraseña:</label>
      <input type="password" v-model="data.new_password" required />

      <label>Confirmar Contraseña:</label>
      <input type="password" v-model="data.new_password_try" required />
      <button type="submit">Enviar Correo</button>
    </form>
  </div>
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
