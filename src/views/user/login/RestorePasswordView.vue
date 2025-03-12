<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { alertService } from '@/services/alertService'
import { userService } from '@/services/userService'

const data = ref({
  email: null,
  emailTry: null
})
const router = useRouter()

const submitSendEmail = async () => {
  if (data.value.email === data.value.emailTry) {
    try {
      await userService.requestPasswordReset(data.value)
      alertService.generalSucces('Correo enviado')
      router.push({ name: 'Login' })
    } catch (error) {
      alertService.generalError('Correo no existe')
    }
  } else {
    alertService.generalError('Correos no coinciden')
  }
}
</script>

<template>
  <div class="login-container">
    <h3>Inserte los datos para rescuperar la contraseña</h3>
    <form @submit.prevent="submitSendEmail">
      <label>Correo:</label>
      <input type="email" v-model="data.email" required />

      <label>Confirmar Correo:</label>
      <input type="email" v-model="data.emailTry" required />
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
