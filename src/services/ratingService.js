import axiosInstance from '@/plugins/axios'

export const ratingService = {
  getLastRatingByCustomer: function (id_customer) {
    return axiosInstance.get(`/rating/full/customer/last_update/${id_customer}`)
  }
}
