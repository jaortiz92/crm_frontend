import { defineStore } from 'pinia'

export const useSplashStore = defineStore('splash', {
  state: () => ({
    isVisible: false
  }),
  actions: {
    show() {
      this.isVisible = true
    },
    hide() {
      this.isVisible = false
    }
  }
})
