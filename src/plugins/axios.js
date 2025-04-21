import axios from 'axios'
import { useUserStore } from '@/stores/userStore'

const axiosInstance = axios.create({
  baseURL: 'http://127.0.0.1:8003',
  timeout: 10000, // 10 seconds
  headers: {
    'Content-Type': 'application/json'
  }
})

axiosInstance.interceptors.request.use(
  (config) => {
    const userStore = useUserStore()
    if (!userStore.token) {
      userStore.loadToken()
    }
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

export default axiosInstance
