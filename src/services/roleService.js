import axiosInstance from '@/plugins/axios'

export const roleService = {
  getRoles: function () {
    return axiosInstance.get(`/role/?skip=0&limit=100`)
  },
  getRoleById: function (id_role) {
    return axiosInstance.get(`/role/${id_role}`)
  }
}
