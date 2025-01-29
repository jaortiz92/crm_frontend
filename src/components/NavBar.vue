<script setup>
import { useUserStore } from '@/stores/userStore.js'
import { useRouter } from 'vue-router'
import { computed, ref, watch } from 'vue'

const router = useRouter()
const userStore = useUserStore()
const logout = async () => {
  userStore.logout()
  router.push({ name: 'Login' })
}

const hasToken = computed(() => userStore.token)

const first_name = ref('')
const last_name = ref('')

const addDataUser = async () => {
  last_name.value = await userStore.user.last_name
  first_name.value = await userStore.user.first_name
}

watch(
  () => userStore.user,
  () => {
    if (userStore.user) {
      addDataUser()
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="header">
    <div :class="{ 'logo-logged': hasToken, 'logo-login': !hasToken }">
      <img src="@/assets/logo.svg" alt="Logo" />
      <h4 v-if="hasToken" class="welcome">
        Bienvenido
        <router-link :to="{ name: 'UserDetail' }"> {{ first_name }} {{ last_name }} </router-link>
      </h4>
    </div>
    <nav v-show="hasToken" class="nav">
      <div>
        <ul>
          <li class="button-nav">
            <RouterLink to="/">Home</RouterLink>
          </li>
          <li class="button-nav">
            <RouterLink to="/customer">Clientes</RouterLink>
          </li>
          <li class="button-nav">
            <RouterLink to="/customerTrip">Viajes De Cliente</RouterLink>
          </li>
          <li class="button-nav">
            <RouterLink to="/order">Ordenes</RouterLink>
          </li>
          <li class="button-nav">
            <RouterLink to="/invoice">Facturas</RouterLink>
          </li>
          <li class="button-nav">
            <RouterLink to="/activity">Actividades</RouterLink>
          </li>
          <li class="button-nav">
            <RouterLink to="/task">Tareas</RouterLink>
          </li>
          <li class="button-nav logout"><div @click="logout">Cerrar Sesion</div></li>
        </ul>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logo-login img {
  width: 200px;
  margin-bottom: 0px;
  padding-bottom: 10px;
}

.logo-logged {
  display: flex;
  width: 100%;
  justify-content: space-between;
}
.logo-logged img {
  width: 100px;
  margin-bottom: 0px;
  padding-bottom: 10px;
}
nav {
  padding: 0px 10px 0px 10px;
  box-shadow: 0 1px 6px var(--shadow);
  margin-bottom: 10px;
  width: 100%;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: left;
}

li {
  margin: 2px;
  display: flex;
  align-items: center;
}

.logout {
  margin-left: auto;
}

.button-nav,
a {
  color: var(--text-white);
  text-decoration: none;
  color: var(--text-white);
  padding: 8px 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
}

.button-nav:hover,
a:hover {
  background-color: var(--light-color-opposite-two);
}
.button-nav.router-link-active,
a.router-link-active {
  font-weight: bold;
}

.welcome a {
  color: var(--text-black);
}

.welcome a:hover {
  color: var(--text-white);
}
</style>
