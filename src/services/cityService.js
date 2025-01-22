import axiosInstance from '@/plugins/axios'

export const cityService = {
  getCities: function () {
    return axiosInstance.get(`/city/?skip=0&limit=10000`)
  },
  getCitiesByDepartment: function (id_department) {
    return axiosInstance.get(`/city/department/${id_department}`)
  },
  getCityById: function (id_city) {
    return axiosInstance.get(`/city/${id_city}`)
  }
}
