import axiosInstance from '@/plugins/axios'

export const useRoleService = {
  getRoles: function () {
    return axiosInstance.get(`/role/?skip=0&limit=100`)
  }
}
