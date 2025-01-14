import axiosInstance from '@/plugins/axios'

export const advanceService = {
  getAdvances: function () {
    return axiosInstance.get(`/advance/?skip=0&limit=100`)
  },
  getAdvanceById: function (id_advance) {
    return axiosInstance.get(`/advance/${id_advance}`)
  },
  getAdvanceByIdOrder: function (id_order) {
    return axiosInstance.get(`/advance/order/${id_order}`)
  },
  createAdvance: function (advance) {
    return axiosInstance.post(`/advance/`, advance)
  },
  updateAdvance: function (id_advance, advance) {
    return axiosInstance.put(`/advance/${id_advance}`, advance)
  }
}
