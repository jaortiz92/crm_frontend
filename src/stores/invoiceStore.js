import { defineStore } from 'pinia'

export const useInvoiceStore = defineStore('invoiceStore', {
  state: () => ({
    invoice: null
  }),
  actions: {
    setInvoice(invoice) {
      this.invoice = invoice
    },
    getInvoice() {
      return this.invoice
    },
    clearInvoice() {
      this.invoice = null
    },
    isThereInvoice() {
      if (this.invoice === null) {
        return false
      } else {
        return true
      }
    }
  }
})
