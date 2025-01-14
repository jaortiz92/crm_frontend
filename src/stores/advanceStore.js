import { defineStore } from 'pinia'

export const useAdvanceStore = defineStore('advanceStore', {
  state: () => ({
    advance: null
  }),
  actions: {
    setAdvance(advance) {
      this.advance = advance
    },
    getAdvance() {
      return this.advance
    },
    clearAdvance() {
      this.advance = null
    },
    isThereAdvance() {
      if (this.advance === null) {
        return false
      } else {
        return true
      }
    }
  }
})
