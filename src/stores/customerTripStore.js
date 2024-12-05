import { defineStore } from 'pinia'

export const useCustomerTripStore = defineStore('customerTripStore', {
  state: () => ({
    customerTrip: null
  }),
  actions: {
    setCustomerTrip(customerTrip) {
      this.customerTrip = customerTrip
    },
    getCustomerTrip() {
      return this.customerTrip
    },
    clearCustomerTrip() {
      this.customerTrip = null
    },
    isThereCustomerTrip() {
      if (this.customerTrip === null) {
        return false
      } else {
        return true
      }
    }
  }
})
