import axiosInstance from '@/plugins/axios'

export const orderService = {
  getOrders: function () {
    return axiosInstance.get(`/order/full/`)
  },
  getOrdersByCutomerTrip: function (id_customer_trip) {
    return axiosInstance.get(`/order/customer_trip/${id_customer_trip}`)
  }
}
