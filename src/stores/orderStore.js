import { defineStore } from 'pinia'

export const useOrderStore = defineStore('orderStore', {
  state: () => ({
    order: null
  }),
  actions: {
    setOrder(order) {
      this.order = order
    },
    getOrder() {
      return this.order
    },
    clearOrder() {
      this.order = null
    },
    isThereOrder() {
      if (this.order === null) {
        return false
      } else {
        return true
      }
    }
  }
})
