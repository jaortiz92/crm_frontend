<script setup>
import { useUserStore } from '@/stores/userStore.js'
import { useRouter } from 'vue-router'
import { computed, ref } from 'vue'

const router = useRouter()
const userStore = useUserStore()
const menuOpen = ref(false)
const openDropdown = ref(null)
const userMenuOpen = ref(false)

const logout = async () => {
  userStore.logout()
  router.push({ name: 'Login' })
}

const hasToken = computed(() => userStore.token)

const userFullName = computed(() => {
  return userStore.user ? `${userStore.user.first_name} ${userStore.user.last_name}` : ''
})

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
}

const closeMenu = () => {
  menuOpen.value = false
}

const toggleDropdown = (name) => {
  openDropdown.value = openDropdown.value === name ? null : name
}

const closeDropdowns = () => {
  openDropdown.value = null
}

const toggleUserMenu = () => {
  userMenuOpen.value = !userMenuOpen.value
}

const closeUserMenu = () => {
  userMenuOpen.value = false
}

const closeAllMenus = () => {
  closeMenu()
  closeDropdowns()
  closeUserMenu()
}

const navGroups = [
  {
    name: 'comercial',
    label: 'Comercial',
    accentColor: '#14a1d9',
    items: [
      { label: 'Viajes De Cliente', to: '/customerTrip', permission: 'low' },
      { label: 'Ordenes', to: '/order', permission: 'low' },
      { label: 'Facturas', to: '/invoice', permission: 'low' },
      { label: 'Envios', to: '/shipment', permission: 'low' }
    ]
  },
  {
    name: 'gestion',
    label: 'Gestión',
    accentColor: '#7385e8',
    items: [
      { label: 'Actividades', to: '/activity', permission: 'low' },
      { label: 'Tareas', to: '/task', permission: 'low' }
    ]
  },
  {
    name: 'admin',
    label: 'Administración',
    accentColor: '#c21a1a',
    items: [
      { label: 'Cargas Masivas', to: '/bulkUpload', permission: 'mediumHigh' },
      { label: 'Consultas', to: '/queries', permission: 'mediumHigh' },
      { label: 'Eliminaciones', to: '/deletions', permission: 'high' }
    ]
  }
]

const visibleGroups = computed(() => {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => userStore.hasPermission(item.permission))
    }))
    .filter((group) => group.items.length > 0)
})
</script>

<template>
  <div class="header">
    <div :class="{ 'logo-logged': hasToken, 'logo-login': !hasToken }">
      <img src="@/assets/logo.svg" alt="Logo" />
    </div>
    <button class="hamburger" @click="toggleMenu" aria-label="Menú de navegación" v-if="hasToken">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
    <nav v-show="hasToken" class="nav" :class="{ 'nav-open': menuOpen }">
      <button class="hamburger-close" @click="closeMenu" aria-label="Cerrar menú">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div>
        <ul>
          <li v-if="userStore.hasPermission('low')" class="button-nav">
            <RouterLink to="/" @click="closeAllMenus" style="--accent: #14a1d9">Home</RouterLink>
          </li>
          <li v-if="userStore.hasPermission('low')" class="button-nav">
            <RouterLink to="/customer" @click="closeAllMenus" style="--accent: #a5d5b7">Clientes</RouterLink>
          </li>
          <li v-for="group in visibleGroups" :key="group.name" class="dropdown">
            <button class="dropdown-toggle" @click="toggleDropdown(group.name)" :style="{ '--accent': group.accentColor }">
              {{ group.label }}
              <span class="arrow">▼</span>
            </button>
            <ul v-show="openDropdown === group.name" class="dropdown-menu">
              <li v-for="item in group.items" :key="item.to" class="button-nav">
                <RouterLink :to="item.to" @click="closeAllMenus">{{ item.label }}</RouterLink>
              </li>
            </ul>
          </li>
          <li v-if="hasToken" class="dropdown user-dropdown">
            <button class="dropdown-toggle user-toggle" @click="toggleUserMenu" :style="{ '--accent': '#0d6ba6' }">
              {{ userFullName }}
              <span class="arrow">▼</span>
            </button>
            <ul v-show="userMenuOpen" class="dropdown-menu user-dropdown-menu">
              <li class="button-nav">
                <RouterLink :to="{ name: 'UserDetail' }" @click="closeAllMenus">Mi Perfil</RouterLink>
              </li>
              <li class="button-nav logout"><div @click="logout">Cerrar Sesion</div></li>
            </ul>
          </li>
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

@media (min-width: 768px) {
  .header {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 0 1rem;
  }
}

.logo-login {
  padding-right: 1.5rem;
}

.logo-login img {
  width: 200px;
  margin-bottom: 0px;
  padding-bottom: 10px;
}

.logo-logged {
  padding-right: 1.5rem;
}

.logo-logged img {
  width: 100px;
  margin-bottom: 0px;
  padding-bottom: 10px;
}

@media (min-width: 768px) {
  .logo-logged {
    border-right: 1px solid rgba(255, 255, 255, 0.15);
    padding-right: 1.5rem;
    margin-right: 0.5rem;
  }
  .logo-login {
    border-right: 1px solid rgba(255, 255, 255, 0.15);
    padding-right: 1.5rem;
    margin-right: 0.5rem;
  }
}

.hamburger {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: var(--text-white);
  align-items: center;
  justify-content: center;
}

.hamburger-close {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: var(--text-white);
  align-self: flex-end;
}

nav {
  padding: 0px 10px 0px 10px;
  box-shadow: 0 1px 6px var(--shadow);
  margin-bottom: 10px;
  width: 100%;
}

@media (max-width: 767px) {
  .hamburger {
    display: flex;
  }
  .hamburger-close {
    display: flex;
  }
  nav {
    display: none;
  }
  nav.nav-open {
    display: block;
  }
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: left;
}

@media (max-width: 767px) {
  ul {
    flex-direction: column;
  }
}

li {
  margin: 2px;
  display: flex;
  align-items: center;
}

.dropdown {
  position: relative;
}

.dropdown-toggle {
  color: var(--text-white);
  text-decoration: none;
  padding: 8px 10px;
  padding-left: 13px;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
  background: none;
  border: none;
  font-size: inherit;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 4px;
  border-left: 3px solid var(--accent, transparent);
}

.dropdown-toggle:hover {
  background-color: var(--light-color-opposite-two);
}

.arrow {
  font-size: 0.6rem;
  transition: transform 0.2s;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  background-color: var(--dark-color);
  border-radius: 5px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  min-width: 180px;
  z-index: 100;
  padding: 4px  ;
}

@media (max-width: 767px) {
  .dropdown-menu {
    position: static;
    box-shadow: none;
    background-color: transparent;
    padding: 1rem;
  }
}

.dropdown-menu li {
  margin-right: 4px;
  padding: 4px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  border-left: 4px solid rgba(255, 255, 255, 0.5);
}

.dropdown-menu li:first-child {
  border-top: 2px solid rgba(255, 255, 255, 0.1);
}

.dropdown-menu .button-nav a {
  padding: 8px 16px;
  display: block;
}

.user-dropdown {
  margin-left: auto;
}

.user-dropdown-menu {
  right: 0;
  left: auto;
}

.button-nav,
a {
  color: var(--text-white);
  text-decoration: none;
  color: var(--text-white);
  padding: 8px 10px;
  padding-left: 13px;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
  border-left: 3px solid var(--accent, transparent);
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