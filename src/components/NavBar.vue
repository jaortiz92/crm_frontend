<script setup>
import { useUserStore } from '@/stores/userStore.js'
import { useRouter } from 'vue-router'

const router = useRouter()
const userStore = useUserStore()
const logout = async () => {
  userStore.logout()
  router.push({ name: 'Login' })
}
</script>

<template>
  <div class="header">
    <img src="@/assets/logo.svg" alt="Logo" class="logo" />
    <nav v-show="userStore.token" class="nav">
      <div>
        <ul>
          <li class="button-nav">
            <RouterLink to="/">Home</RouterLink>
          </li>
          <li class="button-nav">
            <RouterLink to="/">Home</RouterLink>
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

.logo {
  width: 200px;
  margin-bottom: 0px;
  padding-bottom: 10px;
}
nav {
  padding: 10px;
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
  margin: 0 20px;
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
</style>
