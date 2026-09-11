import axios from 'axios'
import { useUserStore } from '@/stores/userStore'

/**
 * Normaliza VITE_API_URL: un valor relativo SIN barra inicial (p. ej. "api")
 * lo el navegador resuelve contra el path de la página, rompiendo todas las
 * llamadas en rutas anidadas (p. ej. /budget/planning -> /budget/api/...).
 * Se convierte a ruta absoluta de origen ("/api"); URLs http(s):// intactas.
 */
function normalizeApiBaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl
  if (/^\//.test(rawUrl) || /^[a-z][a-z\d+\-.]*:\/\//i.test(rawUrl)) return rawUrl
  return `/${rawUrl}`
}

const axiosInstance = axios.create({
  baseURL: normalizeApiBaseUrl(import.meta.env.VITE_API_URL),
  timeout: 20000, // 20 seconds
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
