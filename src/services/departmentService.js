import axiosInstance from '@/plugins/axios'

export const departmentService = {
  getDepartments: function () {
    return axiosInstance.get(`/department/?skip=0&limit=100`)
  }
}
