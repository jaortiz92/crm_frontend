import axiosInstance from '@/plugins/axios'

export const useStoreTypeService = {
  getStoreTypes: function () {
    return axiosInstance.get(`/storeType/?skip=0&limit=100`)
  }
}
