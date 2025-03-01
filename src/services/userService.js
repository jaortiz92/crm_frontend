import axiosInstance from '@/plugins/axios'

export const userService = {
  login: function (username, password) {
    return axiosInstance.post(`/login/?username=${username}&password=${password}`)
  },
  me: function () {
    return axiosInstance.get(`/login/me/`)
  },
  getUsers: function (skip, limit) {
    return axiosInstance.get(`/user/?skip=${skip}&limit=${limit}`)
  },
  createUser: function (user) {
    return axiosInstance.post(`/user/`, user)
  },
  updateUser: function (id_user, user) {
    return axiosInstance.put(`/user/${id_user}`, user)
  },
  getUser: function (id_user) {
    return axiosInstance.get(`/user/full/${id_user}`)
  }
}
