import axiosInstance from '@/plugins/axios'

export const brandService = {
  getBrands: function () {
    return axiosInstance.get(`/brand/?skip=0&limit=100`)
  }
}
