import { defineStore } from 'pinia'

export const usePhotoStore = defineStore('photoStore', {
  state: () => ({
    photo: null
  }),
  actions: {
    setPhoto(photo) {
      this.photo = photo
    },
    getPhoto() {
      return this.photo
    },
    clearPhoto() {
      this.photo = null
    },
    isTherePhoto() {
      if (this.photo === null) {
        return false
      } else {
        return true
      }
    }
  }
})
