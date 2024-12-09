import { defineStore } from 'pinia'

export const useRatingStore = defineStore('ratingStore', {
  state: () => ({
    rating: null
  }),
  actions: {
    setRating(rating) {
      this.rating = rating
    },
    getRating() {
      return this.rating
    },
    clearRating() {
      this.rating = null
    },
    isThereRating() {
      if (this.rating === null) {
        return false
      } else {
        return true
      }
    }
  }
})
