import axiosInstance from '@/plugins/axios'

export const userService = {
  login: function (username, password) {
    return axiosInstance.post(`/login/?username=${username}&password=${password}`)
  },
  me: function () {
    return axiosInstance.get(`/login/me/`)
  }
}
