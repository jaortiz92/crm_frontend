<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { alertService } from '@/services/alertService'
import { userService } from '@/services/userService'
import { validatePassword } from '@/plugins/validatePassword'

const router = useRouter()
const data = ref({
  current_password: null,
  new_password: null,
  new_password_try: null
})

const statusPassword = computed(() =>
  data.value.new_password
    ? validatePassword.validatePassword(data.value.new_password)
    : { isValid: false, errors: [] }
)

const submitUpdatePassword = async () => {
  if (data.value.new_password !== data.value.new_password_try) {
    alertService.generalError('Contraseñas no coinsiden')
  } else if (!statusPassword.value.isValid) {
    alertService.generalError('Contraseña no cumple con los requisitos minimos')
  } else {
    try {
      await userService.updatePassword(data.value)
      alertService.generalSucces('Contraseñas actualizada')
      router.push({ name: 'UserDetail' })
    } catch (error) {
      alertService.generalError('Contraseña no se pudo cambiar')
    }
  }
}
</script>

<template>
  <div class="login-container">
    <h3>Inserte los datos para rescuperar la contraseña</h3>
    <form @submit.prevent="submitUpdatePassword">
      <label>Contraseña Actual:</label>
      <input type="password" v-model="data.current_password" required />
      <label>Nueva Contraseña:</label>
      <input type="password" v-model="data.new_password" required />
      <ul class="password-requirements">
        <li v-for="error in statusPassword.errors" :key="error" class="error">{{ error }}</li>
      </ul>
      <label>Confirmar Contraseña:</label>
      <input type="password" v-model="data.new_password_try" required />
      <button type="submit">Cambiar Contraseña</button>
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

.password-requirements {
  font-size: 80%;
  color: var(--red-color);
  margin: 10px;
}

.password-requirements li {
  text-align: left;
}
</style>
