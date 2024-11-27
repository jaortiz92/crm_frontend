import { defineStore } from 'pinia'

export const useActivityStore = defineStore('activityStore', {
  state: () => ({
    activity: null
  }),
  actions: {
    setActivity(activity) {
      this.activity = activity
    },
    getActivity() {
      return this.activity
    },
    clearActivity() {
      this.activity = null
    },
    isThereActivity() {
      if (this.activity === null) {
        return false
      } else {
        return true
      }
    }
  }
})
