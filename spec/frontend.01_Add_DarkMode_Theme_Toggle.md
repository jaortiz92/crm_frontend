# Especificación de Implementación Frontend: Dark Mode / Theme Toggle

> **Documento complementario a `spec/01_Add_DarkMode_Theme_Toggle.md`**
> Este documento traduce la especificación de features en pasos de implementación concretos, a nivel de archivo, con código completo y audit de componentes.

---

## Tabla de Contenidos

1. [Resumen del Codebase Actual](#1-resumen-del-codebase-actual)
2. [Archivos a Crear](#2-archivos-a-crear)
3. [Archivos a Modificar](#3-archivos-a-modificar)
4. [Mapeo Completo de Variables CSS Dark Mode](#4-mapeo-completo-de-variables-css-dark-mode)
5. [Auditoría de Componentes (Hardcoded Colors)](#5-auditoría-de-componentes-hardcoded-colors)
6. [Orden de Implementación (Paso a Paso)](#6-orden-de-implementación-paso-a-paso)
7. [Edge Cases y Gotchas](#7-edge-cases-y-gotchas)

---

## 1. Resumen del Codebase Actual

### 1.1 Estructura de Archivos Relevante

```
crm_frontend/
├── index.html                          ← FOUC prevention script
├── vite.config.js                      ← Sin cambios necesarios
├── package.json                        ← Sin cambios necesarios (Pinia ya instalado)
├── src/
│   ├── main.js                         ← Entry point (importa main.css)
│   ├── App.vue                         ← Root component (SplashScreen + NavBar + RouterView)
│   ├── assets/
│   │   ├── base.css                    ← CSS variables (SOLO light mode definidas)
│   │   └── main.css                    ← Estilos globales (tablas, forms, botones)
│   ├── plugins/
│   │   └── axios.js                    ← Sin cambios
│   ├── stores/
│   │   ├── userStore.js                ← Options API pattern (referencia)
│   │   └── splash.js                   ← Options API pattern (referencia)
│   ├── services/
│   │   └── alertService.js             ← SweetAlert2 con colores hardcoded
│   ├── router/
│   │   └── index.js                    ← Sin cambios
│   ├── components/
│   │   ├── NavBar.vue                  ← ★ User dropdown (insertar ThemeToggle aquí)
│   │   ├── SplashScreen.vue            ← Usa vars indefinidos (--brand-blue)
│   │   ├── ModalModel.vue              ← Usa var(--text-white) como bg
│   │   ├── FilterForm.vue              ← Ya usa semantic tokens ✓
│   │   ├── activity/
│   │   │   ├── ActivityKanban.vue      ← ★★ ~50 colores hardcoded
│   │   │   ├── ActivityTable.vue       ← Minimal scoped styles
│   │   │   ├── ActivityInfo.vue        ← Usa semantic tokens ✓
│   │   │   ├── ActivityForm.vue        ← Usa semantic tokens ✓
│   │   │   └── ActivityFormAutho.vue   ← Usa semantic tokens ✓
│   │   ├── collection/
│   │   │   └── CollectionSummary.vue   ← ★★ ~25 colores hardcoded
│   │   ├── customer/
│   │   │   ├── CustomerInfo.vue        ← Usa semantic tokens ✓
│   │   │   ├── CustomerForm.vue        ← Usa semantic tokens ✓
│   │   │   ├── CustomerTable.vue       ← Minimal scoped styles
│   │   │   ├── CustomerSummaryTable.vue← Minimal scoped styles
│   │   │   ├── contact/*               ← Usa semantic tokens ✓
│   │   │   ├── customerTrip/*          ← Mixto
│   │   │   ├── photo/CustomerPhotos.vue← Usa var(--background-light)
│   │   │   └── rating/*                ← Sin revisar en detalle
│   │   ├── order/*                     ← Tablas + Info/Form (tokens)
│   │   ├── invoice/*                   ← Tablas + Info/Form (tokens)
│   │   ├── shipment/*                  ← Tablas + Info/Form (tokens)
│   │   ├── task/
│   │   │   ├── TaskTable.vue           ← Minimal scoped styles
│   │   │   ├── TaskInfo.vue            ← Usa semantic tokens ✓
│   │   │   └── TaskForm.vue            ← Usa semantic tokens ✓
│   │   ├── advance/*                   ← Tablas + Form
│   │   └── user/
│   │       ├── UserInfo.vue            ← Usa semantic tokens ✓
│   │       └── UserForm.vue            ← Usa semantic tokens ✓
│   └── views/
│       ├── HomeView.vue                ← Layout only (sin estilos de color)
│       ├── deletions/DeletionsView.vue ← Usa vars legacy (--background-white, etc.)
│       ├── query/QueriesView.vue       ← Usa vars legacy
│       ├── bulk/BulkUploadView.vue     ← Usa semantic tokens ✓
│       ├── user/login/LoginView.vue    ← Usa semantic tokens ✓
│       ├── activity/
│       │   ├── ActivityDetailView.vue  ← Layout only
│       │   ├── ActivityTypeManagerView.vue ← ★ Usa tokens con fallbacks
│       │   └── ActivityFormView.vue    ← Layout only
│       └── ... (resto son layout wrappers)
```

### 1.2 Patrones Identificados

| Patrón | Descripción | Ejemplos |
|--------|-------------|----------|
| **Semantic tokens (buenos)** | Usan `var(--color-surface-card, #ffffff)` con fallback | FilterForm, LoginView, ActivityInfo, CustomerForm, UserInfo |
| **Legacy vars** | Usan `var(--background-white)`, `var(--text-white)`, `var(--dark-color)` | DeletionsView, QueriesView, NavBar, ModalModel |
| **Hardcoded colors (crítico)** | Colores hex/rgba directos en CSS | ActivityKanban, CollectionSummary |
| **Tablas globales** | Estilos en `main.css` con hex hardcoded | `#edf2f7`, `#ffffff`, `#e8f3ff` |
| **Options API stores** | Todos los stores usan `defineStore('id', { state, actions })` | userStore, splash |

### 1.3 Variables CSS Existentes en `base.css`

```css
/* Legacy vars (necesitan dark mode override) */
--gray-border: #616161;
--light-border: #dddddd;
--text-black: #070707;
--text-gray: #333333;
--text-white: #eeeeee;
--background: #03658b;
--background-white: #f9f9f9;
--background-light: #bdd0d7;
--background-transparency: rgba(0, 16, 62, 0.7);
--normal-color: #14a1d9;
--light-color: #05c7f2;
--dark-color: #0d6ba6;
--normal-color-opposite-one: #a5d5b7;
--normal-color-opposite-two: #2643df;
--light-color-opposite-one: #d0ebda;
--light-color-opposite-two: #7385e8;
--dark-color-opposite-one: #499a67;
--dark-color-opposite-two: #0a2098;
--red-color: #c21a1a;
--shadow: var(--dark-color-opposite-two);
--border-radius-size: 8px;

/* Semantic tokens (necesitan dark mode override) */
--color-surface: #f9f9f9;
--color-surface-card: #ffffff;
--color-border: rgba(97, 97, 97, 0.15);
--color-border-strong: rgba(97, 97, 97, 0.3);
--color-text-primary: #070707;
--color-text-secondary: #616161;
--color-text-tertiary: rgba(97, 97, 97, 0.5);
--color-brand: #03658c;
--color-brand-hover: #05c7f2;
--color-brand-light: #d0ebda;
--color-accent: #0a2098;
--color-success: #499a67;
--color-warning: #e2a50d;
--color-danger: #c21a1a;
```

### 1.4 User Dropdown Menu (NavBar.vue líneas 160-177)

```html
<li v-if="hasToken" class="dropdown user-dropdown">
  <button class="dropdown-toggle user-toggle" @click="toggleUserMenu"
    :style="{ '--accent': '#0d6ba6' }">
    {{ userFullName }}
    <span class="arrow">▼</span>
  </button>
  <ul v-show="userMenuOpen" class="dropdown-menu user-dropdown-menu">
    <li class="button-nav">
      <RouterLink :to="{ name: 'UserDetail' }" @click="closeAllMenus">Mi Perfil</RouterLink>
    </li>
    <li class="button-nav logout">
      <div @click="logout">Cerrar Sesion</div>
    </li>
  </ul>
</li>
```

**→ El ThemeToggle se inserta como un nuevo `<li>` entre "Mi Perfil" y "Cerrar Sesion".**

---

## 2. Archivos a Crear

### 2.1 `src/stores/themeStore.js` (NUEVO)

**Propósito**: Pinia store para gestionar el estado del tema (light/dark), persistencia en localStorage, y detección de preferencia del sistema.

**Patrón**: Options API (consistente con `userStore.js` y `splash.js`).

```js
import { defineStore } from 'pinia'

const STORAGE_KEY = 'theme-preference'

export const useThemeStore = defineStore('themeStore', {
  state: () => ({
    theme: 'light',             // 'light' | 'dark' (tema actualmente aplicado)
    systemPreference: 'light',  // 'light' | 'dark' (preferencia detectada del SO)
    mediaQuery: null            // referencia al MediaQueryList para cleanup
  }),

  getters: {
    isDark: (state) => state.theme === 'dark',
    /**
     * Retorna true si el usuario tiene una preferencia manual guardada.
     * Si es null/undefined, se está siguiendo la preferencia del sistema.
     */
    hasManualPreference: () => {
      return localStorage.getItem(STORAGE_KEY) !== null
    }
  },

  actions: {
    /**
     * Inicializa el tema al arrancar la aplicación.
     * 1. Detecta preferencia del sistema
     * 2. Verifica si hay preferencia manual en localStorage
     * 3. Aplica el tema correspondiente
     * 4. Escucha cambios del sistema (solo si no hay preferencia manual)
     */
    initTheme() {
      // 1. Detectar preferencia del sistema
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      this.systemPreference = mql.matches ? 'dark' : 'light'
      this.mediaQuery = mql

      // 2. Verificar preferencia manual
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') {
        this.theme = stored
      } else {
        this.theme = this.systemPreference
      }

      // 3. Aplicar tema al DOM
      this.applyTheme()

      // 4. Escuchar cambios del sistema
      mql.addEventListener('change', this.handleSystemChange)
    },

    /**
     * Alterna entre light y dark.
     * Persiste la elección manual del usuario en localStorage.
     */
    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem(STORAGE_KEY, this.theme)
      this.applyTheme()
    },

    /**
     * Aplica el tema actual al documento HTML
     * estableciendo el atributo data-theme en <html>.
     */
    applyTheme() {
      document.documentElement.setAttribute('data-theme', this.theme)
    },

    /**
     * Responde a cambios en la preferencia del sistema.
     * Solo actúa si el usuario NO tiene una preferencia manual guardada.
     */
    handleSystemChange(event) {
      this.systemPreference = event.matches ? 'dark' : 'light'
      if (!this.hasManualPreference) {
        this.theme = this.systemPreference
        this.applyTheme()
      }
    },

    /**
     * Limpia el listener del media query (para teardown si fuera necesario).
     */
    destroy() {
      if (this.mediaQuery) {
        this.mediaQuery.removeEventListener('change', this.handleSystemChange)
        this.mediaQuery = null
      }
    }
  }
})
```

### 2.2 `src/components/ThemeToggle.vue` (NUEVO)

**Propósito**: Componente toggle visual con iconos sol/luna, accesible por teclado, con ARIA attributes.

```vue
<script setup>
import { useThemeStore } from '@/stores/themeStore'
import { computed } from 'vue'

const themeStore = useThemeStore()

const isDark = computed(() => themeStore.isDark)

const toggle = () => {
  themeStore.toggleTheme()
}
</script>

<template>
  <button
    class="theme-toggle"
    role="switch"
    :aria-checked="isDark"
    aria-label="Alternar modo oscuro"
    @click="toggle"
  >
    <span class="toggle-track" :class="{ 'track-dark': isDark }">
      <span class="toggle-thumb" :class="{ 'thumb-dark': isDark }">
        <!-- Sun icon (shown in light mode) -->
        <svg
          v-show="!isDark"
          class="toggle-icon icon-sun"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        <!-- Moon icon (shown in dark mode) -->
        <svg
          v-show="isDark"
          class="toggle-icon icon-moon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
    </span>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
  /* Override global button styles from main.css */
  color: inherit;
  font-weight: normal;
  min-width: auto;
  max-width: none;
  margin: 0;
}

.theme-toggle:hover {
  /* Override global button:hover */
  background-color: none;
}

.toggle-track {
  display: flex;
  align-items: center;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  padding: 2px;
  background-color: #d1d5db;
  transition: background-color 0.3s ease;
  position: relative;
}

.toggle-track.track-dark {
  background-color: var(--color-brand, #03658c);
}

.toggle-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #ffffff;
  transition: transform 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-thumb.thumb-dark {
  transform: translateX(20px);
  background-color: #1e293b;
}

.toggle-icon {
  width: 12px;
  height: 12px;
}

.icon-sun {
  color: #f59e0b;
}

.icon-moon {
  color: #a5b4fc;
}
</style>
```

---

## 3. Archivos a Modificar

### 3.1 `index.html` — FOUC Prevention Script

**Qué cambia**: Agregar un inline script ANTES de la carga del módulo Vue que lee `localStorage` y setea `data-theme` inmediatamente en `<html>`. Esto previene el flash de contenido incorrecto (FOUC).

**Cambio específico**: Insertar antes de `<script type="module" src="/src/main.js">`.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Capratex CRM</title>
  </head>
  <body>
    <div id="app"></div>
    <!-- Theme initialization: prevents FOUC by setting data-theme before Vue mounts -->
    <script>
      (function() {
        var stored = localStorage.getItem('theme-preference');
        var theme;
        if (stored === 'light' || stored === 'dark') {
          theme = stored;
        } else {
          theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', theme);
      })();
    </script>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

### 3.2 `src/assets/base.css` — Dark Mode CSS Variables

**Qué cambia**: Agregar un bloque `:root[data-theme="dark"]` después del `:root` existente, con overrides para TODAS las variables CSS.

**Cambio específico**: Insertar después de la línea 42 (después del cierre de `:root`), antes de `#app`.

Ver [Sección 4](#4-mapeo-completo-de-variables-css-dark-mode) para el mapeo completo.

```css
/* === DARK MODE === */
:root[data-theme="dark"] {
  /* --- Legacy vars --- */
  --gray-border: #3d4f63;
  --light-border: #2a3a4e;
  --text-black: #f0f4f8;
  --text-gray: #c8d4e0;
  --text-white: #e2e8f0;
  --background: #0d3b5c;
  --background-white: #0f1d2e;
  --background-light: #1a2d42;
  --background-transparency: rgba(5, 12, 25, 0.85);
  --normal-color: #1a8abf;
  --light-color: #22b8e8;
  --dark-color: #0a4d7a;
  --normal-color-opposite-one: #5aad7a;
  --normal-color-opposite-two: #5b6ee0;
  --light-color-opposite-one: #1e3a2a;
  --light-color-opposite-two: #4a5ac7;
  --dark-color-opposite-one: #499a67;
  --dark-color-opposite-two: #3d52c9;
  --red-color: #e04545;
  --shadow: rgba(0, 0, 0, 0.4);
  --border-radius-size: 8px;

  /* --- Semantic tokens --- */
  --color-surface: #0f1d2e;
  --color-surface-card: #132238;
  --color-border: rgba(100, 150, 200, 0.15);
  --color-border-strong: rgba(100, 150, 200, 0.3);
  --color-text-primary: #f0f4f8;
  --color-text-secondary: #a0b0c0;
  --color-text-tertiary: rgba(160, 176, 192, 0.6);

  --color-brand: #1a8abf;
  --color-brand-hover: #22b8e8;
  --color-brand-light: #1a3a4a;
  --color-accent: #5b6ee0;

  --color-success: #5aad7a;
  --color-warning: #f0b429;
  --color-danger: #e04545;
}
```

### 3.3 `src/assets/main.css` — Dark Mode Global Styles

**Qué cambia**: Agregar overrides dark mode para los estilos globales que usan colores hardcoded (tablas, forms, botones, scrollbar, loading overlay).

**Cambio específico**: Agregar al final del archivo (después de la línea 389).

```css
/* ============================================
   DARK MODE OVERRIDES - Global Styles
   ============================================ */

:root[data-theme="dark"] {
  color-scheme: dark;
}

/* --- Body / App background --- */
:root[data-theme="dark"] body {
  background-color: var(--color-surface);
}

/* --- Navigation --- */
:root[data-theme="dark"] nav {
  background-color: var(--background);
}

/* --- Forms --- */
:root[data-theme="dark"] form {
  border-color: var(--gray-border);
}

:root[data-theme="dark"] input,
:root[data-theme="dark"] select,
:root[data-theme="dark"] textarea {
  background-color: var(--color-surface-card);
  color: var(--color-text-primary);
  border-color: var(--gray-border);
}

:root[data-theme="dark"] input:focus,
:root[data-theme="dark"] select:focus,
:root[data-theme="dark"] textarea:focus {
  border-color: var(--light-color);
}

:root[data-theme="dark"] input:disabled,
:root[data-theme="dark"] select:disabled,
:root[data-theme="dark"] textarea:disabled {
  background-color: var(--background-light);
  color: var(--color-text-secondary);
}

/* --- Tables --- */
:root[data-theme="dark"] table {
  border-color: var(--color-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

:root[data-theme="dark"] thead {
  background-color: var(--dark-color);
}

:root[data-theme="dark"] th {
  color: #f0f4f8;
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

:root[data-theme="dark"] td {
  color: var(--text-black);
  border-bottom-color: var(--color-border);
}

:root[data-theme="dark"] tbody tr {
  background-color: var(--color-surface-card);
}

:root[data-theme="dark"] tbody tr:nth-child(even) {
  background-color: #0f2438;
}

:root[data-theme="dark"] tbody tr:hover {
  background-color: rgba(26, 138, 191, 0.15);
}

/* --- Buttons (global rule) --- */
:root[data-theme="dark"] button {
  background-color: var(--dark-color-opposite-two);
  color: var(--text-white);
}

:root[data-theme="dark"] button:hover {
  background-color: var(--light-color-opposite-two);
}

:root[data-theme="dark"] button:disabled {
  background-color: var(--background-light);
  color: var(--color-text-secondary);
}

/* --- Loading overlay --- */
:root[data-theme="dark"] .global-loading-overlay {
  background: var(--background-transparency);
}

/* --- Section title --- */
:root[data-theme="dark"] .section-title {
  color: var(--color-text-primary);
}

/* --- Title --- */
:root[data-theme="dark"] .title {
  color: var(--dark-color-opposite-one);
}

/* --- Checkbox --- */
:root[data-theme="dark"] .checkbox {
  border-color: var(--gray-border);
}
```

### 3.4 `src/App.vue` — Initialize Theme Store

**Qué cambia**: Importar `useThemeStore` y llamar `initTheme()` en `onMounted`.

**Cambio específico**:

```vue
<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import SplashScreen from '@/components/SplashScreen.vue'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()

onMounted(() => {
  themeStore.initTheme()
})

onUnmounted(() => {
  themeStore.destroy()
})
</script>

<template>
  <SplashScreen />
  <header>
    <div>
      <NavBar></NavBar>
    </div>
  </header>
  <RouterView />
</template>

<style></style>
```

### 3.5 `src/components/NavBar.vue` — Insert ThemeToggle in User Dropdown

**Qué cambia**:
1. Importar `ThemeToggle` component.
2. Insertar `<ThemeToggle />` como un nuevo `<li>` en el dropdown del usuario, entre "Mi Perfil" y "Cerrar Sesion".
3. Agregar estilos para el toggle item dentro del dropdown.

**Cambios específicos**:

#### 3.5.1 Script section — Agregar import

```js
// Agregar después de los imports existentes:
import ThemeToggle from '@/components/ThemeToggle.vue'
```

#### 3.5.2 Template section — Insertar ThemeToggle en el dropdown

Reemplazar el bloque `<ul v-show="userMenuOpen" ...>` (líneas 169-176):

```html
<ul v-show="userMenuOpen" class="dropdown-menu user-dropdown-menu">
  <li class="button-nav">
    <RouterLink :to="{ name: 'UserDetail' }" @click="closeAllMenus"
      >Mi Perfil</RouterLink
    >
  </li>
  <li class="button-nav theme-toggle-item">
    <ThemeToggle />
  </li>
  <li class="button-nav logout"><div @click="logout">Cerrar Sesion</div></li>
</ul>
```

#### 3.5.3 Style section — Agregar estilos para el toggle item

Agregar dentro del `<style scoped>`:

```css
.theme-toggle-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  cursor: default;
}

.theme-toggle-item:hover {
  background-color: transparent;
}
```

### 3.6 `src/services/alertService.js` — Dark Mode Aware SweetAlert2

**Qué cambia**: Modificar los colores de SweetAlert2 para que sean sensibles al tema actual. SweetAlert2 crea sus propios modales fuera del scope de Vue, así que necesitamos pasar colores dinámicamente.

**Cambio específico**: Reemplazar el objeto `colors` con una función que retorna colores según el tema.

```js
import Swal from 'sweetalert2'

const getColors = () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  if (isDark) {
    return {
      basicColor: '#1e293b',
      errorColor: '#e04545',
      succesColor: '#5aad7a',
      cancelColor: '#4a5568',
      confirmColor: '#1a8abf',
      infoColor: '#22b8e8',
      background: '#132238',
      color: '#f0f4f8',
      borderColor: '#2a3a4e'
    }
  }

  return {
    basicColor: '#141E28',
    errorColor: '#EA4C89',
    succesColor: '#2EA44F',
    cancelColor: '#AAAAAA',
    confirmColor: '#141E28',
    infoColor: '#4BA6EC',
    background: '#ffffff',
    color: '#070707',
    borderColor: '#dddddd'
  }
}

// Helper para aplicar estilos dark mode al popup de SweetAlert2
const applyDarkModeStyles = (isDark) => {
  if (!isDark) return
  const popup = Swal.getPopup()
  if (popup) {
    popup.style.backgroundColor = '#132238'
    popup.style.color = '#f0f4f8'
  }
  const title = document.querySelector('.swal2-title')
  if (title) title.style.color = '#f0f4f8'
  const htmlContainer = document.querySelector('.swal2-html-container')
  if (htmlContainer) htmlContainer.style.color = '#c8d4e0'
}

export const alertService = {
  async generalError(text) {
    const colors = getColors()
    Swal.fire({
      icon: 'error',
      title: 'Oops...',
      text: `ERROR: ${text}`,
      confirmButtonColor: colors.errorColor,
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(true)
    })
  },
  async generalSucces(text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    Swal.fire({
      icon: 'success',
      title: 'Completado Exitosamente',
      text: `${text}`,
      confirmButtonColor: colors.succesColor,
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
  },
  async generalInformation(textTitle, text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    Swal.fire({
      icon: 'info',
      title: textTitle,
      text: `${text}`,
      confirmButtonColor: colors.succesColor,
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
  },
  async generalWarning(textTitle, text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    Swal.fire({
      icon: 'warning',
      title: textTitle,
      text: `${text}`,
      confirmButtonColor: colors.succesColor,
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
  },
  async generalQuestion(textTitle, text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: colors.confirmColor,
      cancelButtonColor: colors.cancelColor,
      confirmButtonText: 'Si',
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
    return response
  },
  async generalQuestionThree(textTitle, text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonColor: colors.confirmColor,
      cancelButtonColor: colors.infoColor,
      confirmButtonText: 'Si',
      cancelButtonText: 'Cancelar y completar actividad',
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
    return response
  },
  async generalInput(textTitle, text, type, messageToDoesAnswer) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      input: type,
      icon: 'question',
      inputValidator: (value) => {
        if (!value) {
          return messageToDoesAnswer
        }
      },
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
    return response
  },
  async editElement(id, element) {
    return await this.generalQuestion(
      `¿Quiere editar el/la ${element}?`,
      `Editará el/la ${element} con ID: <strong>${id}</strong>`
    )
  },
  async editElementCustomized(value, typeElement, element) {
    return await this.generalQuestion(
      `¿Quiere editar el/la ${element}?`,
      `Editará el/la ${element} con ${typeElement}: <strong>${value}</strong>`
    )
  },
  async createElement(element) {
    return await this.generalQuestion(
      `¿Quiere Crear el/la ${element}?`,
      `Se creará el/la ${element}`
    )
  },
  async updateElement(id, element) {
    return await this.generalQuestion(
      `¿Quiere actualizar el/la ${element}?`,
      `Actualizará ${element} con ID: <strong>${id}</strong>`
    )
  },
  async deleteElement(id, element) {
    return await this.generalQuestion(
      `¿Quiere eliminar el/la ${element}?`,
      `Eliminará el/la ${element} con ID: <strong>${id}</strong>`
    )
  }
}
```

### 3.7 `src/components/SplashScreen.vue` — Fix Undefined CSS Variables

**Qué cambia**: Reemplazar `var(--brand-blue)` y `var(--brand-green)` que NO están definidos en `base.css`, por variables que sí existen.

**Cambio específico**:

```css
/* ANTES (líneas 21-26): */
h1 {
  color: var(--brand-blue);     /* ← NO DEFINIDO */
}
h1 span {
  color: var(--brand-green);    /* ← NO DEFINIDO */
}

/* DESPUÉS: */
h1 {
  color: var(--color-brand, #03658c);
}
h1 span {
  color: var(--color-success, #499a67);
}
```

Además, agregar override dark mode para el splash screen background:

```css
:root[data-theme="dark"] .splash-screen {
  background: var(--color-surface);
  color: var(--color-text-primary);
}
```

> **Nota**: Como el splash screen usa `<style scoped>`, el override dark mode debe ir dentro del mismo bloque scoped o usarse una forma alternativa. Dado que scoped añade el atributo `data-v-xxx`, lo más limpio es cambiar el background a usar una variable CSS que ya se override:

```css
/* Reemplazar en .splash-screen: */
.splash-screen {
  /* ANTES: background: var(--text-white); */
  background: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  /* ... resto igual ... */
}
```

### 3.8 `src/components/ModalModel.vue` — Dark Mode Fix

**Qué cambia**: El modal usa `var(--text-white)` como background (que es `#eeeeee` en light mode). Esto debería usar `var(--color-surface-card)`.

**Cambio específico**:

```css
/* ANTES (línea 59): */
.modal-container {
  background-color: var(--text-white);
  /* ... */
}

/* DESPUÉS: */
.modal-container {
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  /* ... */
}
```

---

## 4. Mapeo Completo de Variables CSS Dark Mode

### 4.1 Tabla de Variables: Light → Dark

| Variable | Light Mode | Dark Mode | Rationale |
|----------|-----------|-----------|-----------|
| **Legacy Vars** | | | |
| `--gray-border` | `#616161` | `#3d4f63` | Azul-gris oscuro para bordes |
| `--light-border` | `#dddddd` | `#2a3a4e` | Borde sutil sobre fondo oscuro |
| `--text-black` | `#070707` | `#f0f4f8` | Texto principal invertido (blanco casi puro) |
| `--text-gray` | `#333333` | `#c8d4e0` | Texto secundario (gris-azul claro) |
| `--text-white` | `#eeeeee` | `#e2e8f0` | Texto sobre fondos oscuros (brand) |
| `--background` | `#03658b` | `#0d3b5c` | Nav brand - tono más oscuro para dark |
| `--background-white` | `#f9f9f9` | `#0f1d2e` | Fondo "blanco" → azul muy oscuro |
| `--background-light` | `#bdd0d7` | `#1a2d42` | Background disabled → azul oscuro |
| `--background-transparency` | `rgba(0,16,62,0.7)` | `rgba(5,12,25,0.85)` | Overlay más opaco |
| `--normal-color` | `#14a1d9` | `#1a8abf` | Brand primario - ligeramente más oscuro |
| `--light-color` | `#05c7f2` | `#22b8e8` | Brand hover - mantener vibrante |
| `--dark-color` | `#0d6ba6` | `#0a4d7a` | Brand dark - más profundo |
| `--normal-color-opposite-one` | `#a5d5b7` | `#5aad7a` | Verde success - ajustar saturación |
| `--normal-color-opposite-two` | `#2643df` | `#5b6ee0` | Acento azul - más claro para dark bg |
| `--light-color-opposite-one` | `#d0ebda` | `#1e3a2a` | Verde muy claro → verde oscuro sutil |
| `--light-color-opposite-two` | `#7385e8` | `#4a5ac7` | Indigo - mantener pero más oscuro |
| `--dark-color-opposite-one` | `#499a67` | `#499a67` | Verde - mantener igual (funciona en ambos) |
| `--dark-color-opposite-two` | `#0a2098` | `#3d52c9` | Indigo oscuro → más claro para dark bg |
| `--red-color` | `#c21a1a` | `#e04545` | Rojo - más brillante para dark bg |
| `--shadow` | `var(--dark-color-opposite-two)` | `rgba(0,0,0,0.4)` | Sombra → negro semi-transparente |
| **Semantic Tokens** | | | |
| `--color-surface` | `#f9f9f9` | `#0f1d2e` | Page background → azul oscuro profundo |
| `--color-surface-card` | `#ffffff` | `#132238` | Card background → azul oscuro medio |
| `--color-border` | `rgba(97,97,97,0.15)` | `rgba(100,150,200,0.15)` | Borde sutil → tinte azul |
| `--color-border-strong` | `rgba(97,97,97,0.3)` | `rgba(100,150,200,0.3)` | Borde fuerte → tinte azul |
| `--color-text-primary` | `#070707` | `#f0f4f8` | Texto principal → blanco azulado |
| `--color-text-secondary` | `#616161` | `#a0b0c0` | Texto secundario → gris azulado |
| `--color-text-tertiary` | `rgba(97,97,97,0.5)` | `rgba(160,176,192,0.6)` | Texto terciario → gris azulado claro |
| `--color-brand` | `#03658c` | `#1a8abf` | Brand - más brillante para dark bg |
| `--color-brand-hover` | `#05c7f2` | `#22b8e8` | Brand hover - mantener vibrante |
| `--color-brand-light` | `#d0ebda` | `#1a3a4a` | Brand light bg → teal oscuro sutil |
| `--color-accent` | `#0a2098` | `#5b6ee0` | Acento - más claro para dark bg |
| `--color-success` | `#499a67` | `#5aad7a` | Success - más brillante |
| `--color-warning` | `#e2a50d` | `#f0b429` | Warning - más brillante |
| `--color-danger` | `#c21a1a` | `#e04545` | Danger - más brillante |

### 4.2 Colores Hardcoded en `main.css` que Necesitan Override

| Selector | Propiedad | Valor Actual | Dark Override |
|----------|-----------|-------------|---------------|
| `table` | `border` | `1px solid #edf2f7` | `1px solid var(--color-border)` |
| `th` | `color` | `#ffffff` | `#f0f4f8` |
| `th` | `border-bottom` | `2px solid rgba(0,0,0,0.08)` | `2px solid rgba(255,255,255,0.08)` |
| `td` | `border-bottom` | `1px solid #edf2f7` | `1px solid var(--color-border)` |
| `tbody tr` | `background-color` | `#ffffff` | `var(--color-surface-card)` |
| `tbody tr:nth-child(even)` | `background-color` | `#e8f3ff` | `#0f2438` |
| `tbody tr:hover` | `background-color` | `rgba(5,199,242,0.2)` | `rgba(26,138,191,0.15)` |

---

## 5. Auditoría de Componentes (Hardcoded Colors)

### 5.1 Componentes CRÍTICOS (Requieren Refactoring)

#### `src/components/activity/ActivityKanban.vue` (~50+ hardcoded colors)

| Línea | Hardcoded | Reemplazar con |
|-------|-----------|----------------|
| 590 | `background-color: #ffffff` | `var(--color-surface-card, #ffffff)` |
| 593 | `box-shadow: 0 8px 30px rgba(0,0,0,0.04)` | `var(--shadow-card)` o mantener (sutil) |
| 594 | `border: 1px solid rgba(0,0,0,0.05)` | `1px solid var(--color-border)` |
| 606 | `border-bottom: 1px solid rgba(0,0,0,0.08)` | `1px solid var(--color-border)` |
| 631 | `color: #666` | `var(--color-text-secondary, #616161)` |
| 681 | `color: #888888` | `var(--color-text-tertiary)` |
| 691 | `background-color: #fafafa` | `var(--color-surface, #f9f9f9)` |
| 703 | `background-color: #ffffff` | `var(--color-surface-card, #ffffff)` |
| 712 | `color: #888888` | `var(--color-text-tertiary)` |
| 725 | `background-color: #e5e5e5` | `var(--color-border-strong)` |
| 726 | `color: #333` | `var(--color-text-primary, #070707)` |
| 758 | `background-color: #ffffff` | `var(--color-surface-card, #ffffff)` |
| 782 | `color: #ffffff` | `var(--text-white, #eeeeee)` |
| 814 | `background: #f1f1f1` | `var(--color-surface, #f9f9f9)` |
| 838 | `background-color: #f3f6f8` | `var(--color-surface, #f9f9f9)` |
| 853 | `background-color: #e9ecef` | `var(--background-light)` |
| 859 | `background-color: #ffffff` | `var(--color-surface-card, #ffffff)` |
| 887 | `color: #777` | `var(--color-text-secondary)` |
| 926 | `color: #ffffff` | `var(--text-white)` |
| 950 | `color: #ffffff` | `var(--text-white)` |
| 961 | `background-color: #c2cfd6` | `var(--color-border-strong)` |
| 962 | `color: #555` | `var(--color-text-secondary)` |
| 988 | `color: #ffffff` | `var(--text-white)` |
| 1022 | `background-color: #ffffff` | `var(--color-surface-card, #ffffff)` |
| 1057 | `border-bottom: 1px dashed #f0f0f0` | `1px dashed var(--color-border)` |
| 1062 | `color: #c1c1c1` | `var(--color-text-tertiary)` |
| 1068 | `color: #888888` | `var(--color-text-tertiary)` |
| 1074 | `color: #999` | `var(--color-text-tertiary)` |
| 1088 | `background-color: #f7f9fa` | `var(--color-surface)` |
| 1094 | `color: #666` | `var(--color-text-secondary)` |
| 1143 | `background-color: #ebedfa` | `var(--color-brand-light)` |
| 1150 | `background-color: #dbe0fa` | `var(--color-brand-light)` |
| 1155 | `border-top: 1px solid #f6f6f6` | `1px solid var(--color-border)` |
| 1164 | `background-color: #fafafa` | `var(--color-surface)` |
| 1172 | `color: #555555` | `var(--color-text-secondary)` |
| 1177 | `color: #333333` | `var(--color-text-primary)` |
| 1206 | `color: #444` | `var(--color-text-secondary)` |

**Estrategia**: Reemplazar todos los valores hardcoded con variables CSS semánticas. Los fallbacks aseguran que light mode siga funcionando.

#### `src/components/collection/CollectionSummary.vue` (~25+ hardcoded colors)

| Línea | Hardcoded | Reemplazar con |
|-------|-----------|----------------|
| 815 | `background-color: #ffffff` | `var(--color-surface-card, #ffffff)` |
| 856 | `color: #666` | `var(--color-text-secondary, #616161)` |
| 896 | `background-color: #ffffff` | `var(--color-surface-card, #ffffff)` |
| 932 | `background: #ffffff` | `var(--color-surface-card, #ffffff)` |
| 993 | `color: #777777` | `var(--color-text-secondary)` |
| 1008 | `border: 1px solid #edf2f7` | `1px solid var(--color-border)` |
| 1024 | `background: #f1f1f1` | `var(--color-surface)` |
| 1119 | `background-color: #ffffff` | `var(--color-surface-card)` |
| 1120 | `border-top: 1px solid #edf2f7` | `1px solid var(--color-border)` |
| 1133 | `color: #666666` | `var(--color-text-secondary)` |
| 1147 | `background-color: #ffffff` | `var(--color-surface-card)` |
| 1158 | `background-color: #f7f9fa` | `var(--color-surface)` |
| 1159 | `border-color: #999` | `var(--color-text-tertiary)` |
| 1170 | `color: #ffffff` | `var(--text-white)` |
| 1191 | `background-color: #fafbfd` | `var(--color-surface)` |
| 1200 | `background-color: #f1f5f9` | `var(--color-surface)` |
| 1201 | `color: #94a3b8` | `var(--color-text-tertiary)` |
| 1222 | `color: #666` | `var(--color-text-secondary)` |

### 5.2 Componentes MODERADOS (Usan vars legacy que necesitan override)

Estos componentes usan `var(--background-white)`, `var(--text-white)`, `var(--dark-color)`, etc. que ya están definidas en `base.css` y tendrán dark mode overrides. **No requieren cambios en el código del componente**, solo las overrides globales en `base.css`.

| Componente | Variables Legacy Usadas |
|------------|------------------------|
| `NavBar.vue` | `--text-white`, `--light-color-opposite-two`, `--dark-color`, `--shadow` |
| `ModalModel.vue` | `--text-white` (como bg), `--background-transparency` |
| `SplashScreen.vue` | `--text-white` (como bg), `--text-black` |
| `DeletionsView.vue` | `--background-white`, `--light-border`, `--text-white`, `--text-black`, `--text-gray`, `--shadow`, `--background-light` |
| `QueriesView.vue` | `--background-white`, `--gray-border`, `--text-white`, `--text-black`, `--background-light`, `--shadow`, `--dark-color-opposite-two` |
| `CustomerPhotos.vue` | `--background-light` |

### 5.3 Componentes BIEN IMPLEMENTADOS (Sin cambios necesarios)

Estos ya usan semantic tokens con fallbacks. Funcionarán correctamente con las dark mode overrides de `base.css`.

| Componente | Estado |
|------------|--------|
| `FilterForm.vue` | ✅ Usa `--color-surface-card`, `--color-border`, `--color-text-*` |
| `LoginView.vue` | ✅ Usa semantic tokens |
| `BulkUploadView.vue` | ✅ Usa semantic tokens |
| `ActivityInfo.vue` | ✅ Usa semantic tokens |
| `ActivityForm.vue` | ✅ Usa semantic tokens |
| `ActivityFormAutho.vue` | ✅ Usa semantic tokens |
| `CustomerForm.vue` | ✅ Usa semantic tokens |
| `CustomerInfo.vue` | ✅ Usa semantic tokens |
| `UserInfo.vue` | ✅ Usa semantic tokens |
| `UserForm.vue` | ✅ Usa semantic tokens |
| `TaskInfo.vue` | ✅ Usa semantic tokens |
| `TaskForm.vue` | ✅ Usa semantic tokens |
| `InvoiceInfo.vue` | ✅ Usa semantic tokens |
| `InvoiceForm.vue` | ✅ Usa semantic tokens |
| `ContactForm.vue` | ✅ Usa semantic tokens |
| `ActivityTypeManagerView.vue` | ✅ Usa semantic tokens con fallbacks |
| `HomeView.vue` | ✅ Solo layout |
| `CustomerDetailView.vue` | ✅ Solo layout |
| `UserDetailView.vue` | ✅ Solo layout |
| `ActivityDetailView.vue` | ✅ Solo layout |

### 5.4 Componentes de Tabla (Scoped styles mínimos)

Estos componentes tienen estilos de tabla mínimos que heredan de `main.css`. Las overrides globales en `main.css` los cubrirán.

| Componente | Scoped styles |
|------------|--------------|
| `ActivityTable.vue` | Solo `width: 100%`, `min-width: 400px` |
| `TaskTable.vue` | Solo `width: 100%`, `min-width: 400px` |
| `CustomerTable.vue` | Solo `width: 95%`, `min-width: 400px` |
| `CustomerSummaryTable.vue` | Solo `width: 100%`, `min-width: 800px` |
| `OrderTable.vue` | Hereda de main.css |
| `InvoiceTable.vue` | Hereda de main.css |
| `ShipmentTable.vue` | Hereda de main.css |
| `AdvanceTable.vue` | Hereda de main.css |

---

## 6. Orden de Implementación (Paso a Paso)

### Fase 1: Infraestructura Base (Sin impacto visual)

| Paso | Archivo | Acción | Dependencias |
|------|---------|--------|-------------|
| 1.1 | `src/stores/themeStore.js` | **CREAR** - Pinia store completo | Ninguna |
| 1.2 | `index.html` | **MODIFICAR** - Agregar FOUC prevention script | Ninguna |
| 1.3 | `src/assets/base.css` | **MODIFICAR** - Agregar bloque `:root[data-theme="dark"]` | 1.1 |
| 1.4 | `src/assets/main.css` | **MODIFICAR** - Agregar overrides dark mode globales | 1.3 |
| 1.5 | `src/App.vue` | **MODIFICAR** - Importar themeStore, llamar initTheme() | 1.1 |

**Checkpoint**: Después de la Fase 1, el toggle del sistema debería funcionar si se cambia manualmente `data-theme="dark"` en el inspector. No hay UI para toggle todavía.

### Fase 2: Componente Toggle + Integración NavBar

| Paso | Archivo | Acción | Dependencias |
|------|---------|--------|-------------|
| 2.1 | `src/components/ThemeToggle.vue` | **CREAR** - Componente toggle con iconos | 1.1 |
| 2.2 | `src/components/NavBar.vue` | **MODIFICAR** - Importar ThemeToggle, insertar en dropdown | 2.1 |

**Checkpoint**: El toggle es visible y funcional en el dropdown del usuario. Cambia entre light/dark.

### Fase 3: Fix de Componentes con Bugs/Inconsistencias

| Paso | Archivo | Acción | Dependencias |
|------|---------|--------|-------------|
| 3.1 | `src/components/SplashScreen.vue` | **MODIFICAR** - Fix vars indefinidos (`--brand-blue`, `--brand-green`) | 1.3 |
| 3.2 | `src/components/ModalModel.vue` | **MODIFICAR** - Cambiar `--text-white` bg a `--color-surface-card` | 1.3 |

### Fase 4: Refactoring de Componentes Críticos (Hardcoded Colors)

| Paso | Archivo | Acción | Dependencias |
|------|---------|--------|-------------|
| 4.1 | `src/components/activity/ActivityKanban.vue` | **MODIFICAR** - Reemplazar ~50 colores hardcoded con vars CSS | 1.3 |
| 4.2 | `src/components/collection/CollectionSummary.vue` | **MODIFICAR** - Reemplazar ~25 colores hardcoded con vars CSS | 1.3 |

### Fase 5: SweetAlert2 Dark Mode

| Paso | Archivo | Acción | Dependencias |
|------|---------|--------|-------------|
| 5.1 | `src/services/alertService.js` | **MODIFICAR** - Hacer colores dinámicos según tema | 1.3 |

### Fase 6: Testing Visual Manual

| Paso | Acción |
|------|--------|
| 6.1 | Verificar todas las vistas en light mode (no regressions) |
| 6.2 | Verificar todas las vistas en dark mode |
| 6.3 | Verificar toggle desde el dropdown del usuario |
| 6.4 | Verificar persistencia (recargar página) |
| 6.5 | Verificar detección de preferencia del sistema |
| 6.6 | Verificar que al tener preferencia manual, cambios del SO no afectan |
| 6.7 | Verificar SweetAlert2 modals en ambos modos |
| 6.8 | Verificar responsive (mobile dropdown con toggle) |
| 6.9 | Verificar accesibilidad (Tab, Enter, Space en toggle) |
| 6.10 | Verificar FOUC (recargar con dark mode - no debe flash white) |

---

## 7. Edge Cases y Gotchas

### 7.1 Variables CSS No Definidas

**Problema**: `SplashScreen.vue` usa `var(--brand-blue)` y `var(--brand-green)` que NO están definidos en `base.css`.
**Solución**: Reemplazar con `var(--color-brand)` y `var(--color-success)` respectivamente.

### 7.2 `--text` Variable No Definida

**Problema**: `base.css` línea 49 usa `color: var(--text)` pero `--text` no está definido.
**Solución**: Cambiar a `color: var(--color-text-primary, #070707)`.

### 7.3 NavBar `button` Global Styles

**Problema**: `main.css` tiene una regla global `button { ... }` que aplica a TODOS los botones, incluyendo el toggle. El ThemeToggle necesita resetear estas propiedades.
**Solución**: En `ThemeToggle.vue`, usar `all: unset` o resetear explícitamente `color`, `font-weight`, `background-color`, `padding`, `border-radius`.

### 7.4 SweetAlert2 Fuera del Scope de Vue

**Problema**: SweetAlert2 crea modales como hijos directos de `<body>`, fuera del scope de Vue y CSS scoped.
**Solución**: Usar `backgroundColor` y `color` como props de Swal, más `didOpen` callback para aplicar estilos a elementos internos (title, html-container).

### 7.5 `color-scheme` CSS Property

**Importante**: Agregar `color-scheme: dark` en dark mode para que los elementos nativos del browser (scrollbars, form controls nativos, etc.) se adapten.

```css
:root[data-theme="dark"] {
  color-scheme: dark;
}
```

### 7.6 Pinia Store Pattern

**Nota**: Todos los stores existentes usan **Options API** (`defineStore('id', { state, actions })`). El `themeStore` DEBE seguir el mismo patrón para consistencia, NO usar Composition API (`defineStore('id', () => { ... })`).

### 7.7 Transiciones CSS y Performance

**Precaución**: Agregar `transition: background-color 0.3s, color 0.3s` en `*` o `body` puede causar un efecto de "fade" suave al cambiar tema, pero también puede causar jank en componentes complejos.
**Recomendación**: NO agregar transición global. El cambio debe ser instantáneo (< 100ms según RNF-01). Las transiciones solo en elementos específicos (toggle thumb, track).

### 7.8 `v-show` vs `v-if` en Dropdown

**Nota**: El dropdown del NavBar usa `v-show` (no `v-if`), lo que significa que el ThemeToggle siempre está montado. Esto es correcto para performance.

### 7.9 Scoped Styles y Dark Mode

**Problema**: Los estilos scoped de `main.css` (como `tbody tr:nth-child(even) { background-color: #e8f3ff }`) NO pueden ser overridos por `base.css` porque `main.css` tiene mayor especificidad por ser más específico.
**Solución**: Las overrides dark mode en `main.css` deben usar el selector `:root[data-theme="dark"]` combinado con el selector original para ganar especificidad:
```css
:root[data-theme="dark"] tbody tr:nth-child(even) {
  background-color: #0f2438;
}
```

### 7.10 `#app` Background

**Problema**: No hay un background color definido para `body` o `#app`. En dark mode, el fondo blanco del browser será visible.
**Solución**: Agregar en `main.css`:
```css
:root[data-theme="dark"] body {
  background-color: var(--color-surface);
}
```

### 7.11 Scrollbar Styling

**Nota**: Los scrollbars custom en `ActivityKanban.vue` y `CollectionSummary.vue` usan `::-webkit-scrollbar` pseudo-elements con colores hardcoded. Estos necesitan ser overridos para dark mode. La estrategia más limpia es agregar las overrides en los scoped styles de cada componente, o bien agregar nuevas variables CSS para scrollbar colors:

```css
/* En base.css :root */
--scrollbar-track: #f1f1f1;
--scrollbar-thumb: var(--background-light);

/* En base.css :root[data-theme="dark"] */
--scrollbar-track: #1a2d42;
--scrollbar-thumb: #2a3a4e;
```

### 7.12 Login Page Background

**Nota**: `LoginView.vue` usa `background: var(--color-surface, #f9f9f9)` para `.login-page`. Esto funcionará automáticamente con las dark mode overrides de `--color-surface`.

### 7.13 Form Element Native Styling

**Precaución**: Los `<select>` elements muestran un dropdown nativo del OS que no se puede estilizar con CSS. En dark mode, el dropdown del select seguirá siendo blanco en algunos browsers.
**Mitigación**: `color-scheme: dark` ayuda en browsers modernos. Para Firefox/Chrome, el native dropdown respeta `color-scheme`.

---

## Apéndice A: Nuevas Variables CSS Sugeridas

Para facilitar el mantenimiento, se sugiere agregar estas variables adicionales a `base.css`:

```css
/* En :root (light mode) */
--color-surface-elevated: #ffffff;      /* Para tooltips, popovers */
--color-surface-sunken: #f0f0f0;        /* Para áreas hundidas (inputs disabled) */
--color-scrollbar-track: #f1f1f1;
--color-scrollbar-thumb: #bdd0d7;
--color-overlay: rgba(0, 16, 62, 0.7);

/* En :root[data-theme="dark"] */
--color-surface-elevated: #1a2d42;
--color-surface-sunken: #0a1628;
--color-scrollbar-track: #1a2d42;
--color-scrollbar-thumb: #2a3a4e;
--color-overlay: rgba(5, 12, 25, 0.85);
```

## Apéndice B: Checklist de Accesibilidad (RNF-03 a RNF-05)

- [ ] Toggle tiene `role="switch"` y `aria-checked` dinámico
- [ ] Toggle tiene `aria-label="Alternar modo oscuro"`
- [ ] Toggle es enfocable con Tab (es un `<button>`)
- [ ] Toggle responde a Enter y Space (nativo de `<button>`)
- [ ] Contraste texto/fondo en dark mode ≥ 4.5:1 (WCAG AA)
  - `#f0f4f8` sobre `#132238` → ratio ~12.5:1 ✅
  - `#a0b0c0` sobre `#132238` → ratio ~7.2:1 ✅
  - `#f0f4f8` sobre `#0f1d2e` → ratio ~13.8:1 ✅

## Apéndice C: Resumen de Archivos

| # | Archivo | Acción | Prioridad |
|---|---------|--------|-----------|
| 1 | `src/stores/themeStore.js` | CREAR | Alta |
| 2 | `src/components/ThemeToggle.vue` | CREAR | Alta |
| 3 | `index.html` | MODIFICAR | Alta |
| 4 | `src/assets/base.css` | MODIFICAR | Alta |
| 5 | `src/assets/main.css` | MODIFICAR | Alta |
| 6 | `src/App.vue` | MODIFICAR | Alta |
| 7 | `src/components/NavBar.vue` | MODIFICAR | Alta |
| 8 | `src/components/SplashScreen.vue` | MODIFICAR | Media |
| 9 | `src/components/ModalModel.vue` | MODIFICAR | Media |
| 10 | `src/components/activity/ActivityKanban.vue` | MODIFICAR | Media |
| 11 | `src/components/collection/CollectionSummary.vue` | MODIFICAR | Media |
| 12 | `src/services/alertService.js` | MODIFICAR | Media |
| **Total** | **2 nuevos + 10 modificados** | | |
