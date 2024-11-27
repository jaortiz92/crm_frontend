import { defineStore } from 'pinia'

export const useTaskStore = defineStore('taskStore', {
  state: () => ({
    task: null
  }),
  actions: {
    setTask(task) {
      this.task = task
    },
    getTask() {
      return this.task
    },
    clearTask() {
      this.task = null
    },
    isThereTask() {
      if (this.task === null) {
        return false
      } else {
        return true
      }
    }
  }
})
