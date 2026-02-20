import axiosInstance from '@/plugins/axios'

export const originTypeService = {
  getOriginTypes: function () {
    return axiosInstance.get(`/originType/?skip=0&limit=100`)
  }
}
