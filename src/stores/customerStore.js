import { defineStore } from 'pinia'

export const useCustomerStore = defineStore('customerStore', {
  state: () => ({
    customer: null
  }),
  actions: {
    setCustomer(customer) {
      this.customer = customer
    },
    getCustomer() {
      return this.customer
    },
    clearCustomer() {
      this.customer = null
    },
    isThereCustomer() {
      if (this.customer === null) {
        return false
      } else {
        return true
      }
    }
  }
})
