import { defineStore } from 'pinia'

const STORAGE_KEY = 'theme-preference'

export const useThemeStore = defineStore('themeStore', {
  state: () => ({
    theme: 'light',
    systemPreference: 'light',
    mediaQuery: null
  }),

  getters: {
    isDark: (state) => state.theme === 'dark',
    hasManualPreference: () => {
      return localStorage.getItem(STORAGE_KEY) !== null
    }
  },

  actions: {
    initTheme() {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      this.systemPreference = mql.matches ? 'dark' : 'light'
      this.mediaQuery = mql

      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') {
        this.theme = stored
      } else {
        this.theme = this.systemPreference
      }

      this.applyTheme()
      mql.addEventListener('change', this.handleSystemChange)
    },

    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem(STORAGE_KEY, this.theme)
      this.applyTheme()
    },

    applyTheme() {
      document.documentElement.setAttribute('data-theme', this.theme)
    },

    handleSystemChange(event) {
      this.systemPreference = event.matches ? 'dark' : 'light'
      if (!this.hasManualPreference) {
        this.theme = this.systemPreference
        this.applyTheme()
      }
    },

    destroy() {
      if (this.mediaQuery) {
        this.mediaQuery.removeEventListener('change', this.handleSystemChange)
        this.mediaQuery = null
      }
    }
  }
})
