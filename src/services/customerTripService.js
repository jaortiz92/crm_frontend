import axiosInstance from '@/plugins/axios'

export const customerTripService = {
  getCustomerTrips: function (skip, limit) {
    return axiosInstance.get(`/customer_trip/full/?skip=${skip}&limit=${limit}`)
  },
  getCustomerTripsById: function (id_customer_trip) {
    return axiosInstance.get(`/customer_trip/full/${id_customer_trip}`)
  },
  getCustomerTripsByCustomer: function (id_customer) {
    return axiosInstance.get(`/customer_trip/full/customer/${id_customer}`)
  }
}
