import axiosInstance from '@/plugins/axios'

export const collectionService = {
  getCollections: function () {
    return axiosInstance.get(`/collection/?skip=0&limit=100`)
  }
}