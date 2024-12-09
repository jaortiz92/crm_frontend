import axiosInstance from '@/plugins/axios'

export const ratingService = {
  getLastRatingByCustomer: function (id_customer) {
    return axiosInstance.get(`/rating/full/customer/last_update/${id_customer}`)
  },
  getRatingsByCustomer: function (id_customer) {
    return axiosInstance.get(`/rating/full/customer/${id_customer}`)
  },
  createRating: function (rating) {
    return axiosInstance.post(`/rating/`, rating)
  },
  updateRating: function (id_rating, rating) {
    return axiosInstance.put(`/rating/${id_rating}`, rating)
  },
  getRatingCategories: function () {
    return axiosInstance.get(`/ratingCategory/?skip=0&limit=100`)
  }
}
