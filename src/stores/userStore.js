// src/stores/auth.js
import { defineStore } from 'pinia'
import axios from 'axios'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    user: null
  }),
  actions: {
    async login(credentials) {
      try {
        // Enviar credenciales al backend para obtener el token
        const response = await axios.post('http://192.168.0.9:8010/login', credentials)
        const { access_token } = response.data

        // Guardar el token en localStorage y en el estado de la tienda
        this.token = access_token
        localStorage.setItem('token', access_token)

        // Obtener los detalles del usuario con el token
        await this.getUserDetails()
      } catch (error) {
        throw new Error('Login failed')
      }
    },
    async getUserDetails() {
      try {
        const response = await axios.get('http://192.168.0.9:8010/user', {
          headers: {
            Authorization: `Bearer ${this.token}`
          }
        })

        this.user = response.data
      } catch (error) {
        this.logout()
        throw new Error('Failed to fetch user details')
      }
    },
    logout() {
      this.token = null
      this.user = null
      localStorage.removeItem('token')
    }
  }
})
