import axiosInstance from '@/plugins/axios'

export const customerTripService = {
  getCustomerTripsByCustomer: function (id_customer) {
    return axiosInstance.get(`/customer_trip/full/${id_customer}`)
  }
}
