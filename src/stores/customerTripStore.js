import { defineStore } from 'pinia'
import { basicModels } from '@/plugins/basicModels'

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
    crateCustomerTripWithId(idCustomer) {
      this.clearCustomerTrip()
      this.customerTrip = { ...basicModels.customerTrip }
      this.customerTrip.id_customer = idCustomer
    },
    isThereCustomerTrip() {
      if (this.customerTrip === null) {
        return false
      } else if (this.customerTrip.id_customer_trip === undefined) {
        return false
      } else {
        return true
      }
    },
    isThereCustomer() {
      if (this.customerTrip === null) {
        return false
      } else if (this.customerTrip.id_customer === undefined) {
        return false
      } else {
        return true
      }
    }
  }
})
