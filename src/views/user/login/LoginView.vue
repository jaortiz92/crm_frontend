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
  <div class="login-page">
    <div class="login-card">
      <div class="section-header">
        <div class="section-accent"></div>
        <h1 class="section-title">Iniciar sesión</h1>
      </div>
      <form @submit.prevent="submitLogin" class="login-form">
        <div class="field-input">
          <label for="username">Usuario</label>
          <input type="text" id="username" v-model="loingdata.username" required />
        </div>
        <div class="field-input">
          <label for="password">Contraseña</label>
          <input type="password" id="password" v-model="loingdata.password" required />
        </div>
        <div class="button-group">
          <button type="submit" class="btn btn-primary">Iniciar sesión</button>
        </div>
      </form>
    </div>
    <router-link :to="{ name: 'RestorePassword' }" class="forgot-link">
      Olvide mi contraseña
    </router-link>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--color-surface, #f9f9f9);
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: var(--border-radius-size, 8px);
  padding: 32px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 24px;
}

.field-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-input label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #616161);
}

.field-input input {
  width: 100%;
  max-width: none;
  padding: 10px 12px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text-primary, #070707);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.field-input input:focus {
  outline: none;
  border-color: var(--color-brand, #03658c);
}

.button-group {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}

.forgot-link {
  margin-top: 16px;
  font-size: 13px;
  color: var(--color-brand, #03658c);
  text-decoration: none;
  transition: color 0.2s;
}

.forgot-link:hover {
  color: var(--color-brand-hover, #05c7f2);
  text-decoration: underline;
}

@media (max-width: 480px) {
  .login-page {
    padding: 20px;
  }

  .login-card {
    padding: 24px;
  }
}
</style>
