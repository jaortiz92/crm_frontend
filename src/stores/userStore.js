import { defineStore } from 'pinia'
import { userService } from '@/services/userService.js'

export const useUserStore = defineStore('userStore', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    username: null,
    user: null
  }),
  actions: {
    async login(username, password) {
      const response = await userService.login(username, password)
      this.setToken(response.data.access_token)
      await this.getUserDetails()
    },
    async getUserDetails() {
      const response = await userService.me()
      this.user = response.data
      this.username = this.user.username
    },
    setToken(newToken) {
      this.token = newToken
      localStorage.setItem('token', newToken)
    },
    loadToken() {
      this.token = localStorage.getItem('token')
    },
    logout() {
      this.token = null
      this.user = null
      this.username = null
      localStorage.removeItem('token')
    },
    hasPermission(requiredAccess) {
      //permissions with scale
      if (!this.user?.role) return false

      const userAccess = this.user.role.access_type
      const roleHierarchy = {
        ninguno: 0,
        low: 1,
        mediumLow: 2,
        medium: 3,
        mediumHigh: 4,
        all: 5
      }

      return roleHierarchy[userAccess] >= roleHierarchy[requiredAccess]
    },

    hasRole(roleNames) {
      //permissions with name
      if (!this.user?.role) return false
      const roles = Array.isArray(roleNames) ? roleNames : [roleNames]
      return roles.includes(this.user.role.role_name)
    }
  }
})
