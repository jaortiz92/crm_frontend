import axiosInstance from '@/plugins/axios'

export const useDepartmentService = {
  getDepartments: function () {
    return axiosInstance.get(`/department/?skip=0&limit=100`)
  }
}
