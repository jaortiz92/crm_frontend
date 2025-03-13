import axiosInstance from '@/plugins/axios'

export const userService = {
  login: function (loingdata) {
    return axiosInstance.post(`/login/`, loingdata)
  },
  me: function () {
    return axiosInstance.get(`/login/me/`)
  },
  requestPasswordReset: function (email) {
    return axiosInstance.post(`/user/request_password_reset/`, email)
  },
  resetPassword: function (data) {
    return axiosInstance.post(`/user/reset_password/`, data)
  },
  updatePassword: function (data) {
    return axiosInstance.put(`/user/update_password/`, data)
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
