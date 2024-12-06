import { defineStore } from 'pinia'

export const useContactStore = defineStore('contactStore', {
  state: () => ({
    contact: null
  }),
  actions: {
    setContact(contact) {
      this.contact = contact
    },
    getContact() {
      return this.contact
    },
    clearContact() {
      this.contact = null
    },
    isThereContact() {
      if (this.contact === null) {
        return false
      } else {
        return true
      }
    }
  }
})
