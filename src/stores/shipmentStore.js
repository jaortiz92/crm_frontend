import { defineStore } from 'pinia'

export const useShipmentStore = defineStore('shipmentStore', {
  state: () => ({
    shipment: null
  }),
  actions: {
    setShipment(shipment) {
      this.shipment = shipment
    },
    getShipment() {
      return this.shipment
    },
    clearShipment() {
      this.shipment = null
    },
    isThereShipment() {
      if (this.shipment === null) {
        return false
      } else {
        return true
      }
    }
  }
})
