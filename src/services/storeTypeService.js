import axiosInstance from '@/plugins/axios'

export const storeTypeService = {
  getStoreTypes: function () {
    return axiosInstance.get(`/storeType/?skip=0&limit=100`)
  }
}
