import axiosInstance from '@/plugins/axios'

export const orderService = {
  getOrders: function (skip, limit) {
    return axiosInstance.get(`/order/full/?skip=${skip}&limit=${limit}`)
  },
  getOrdersByCutomerTrip: function (id_customer_trip) {
    return axiosInstance.get(`/order/customer_trip/${id_customer_trip}`)
  },
  getOrderWithDetails: function (id_ortder) {
    return axiosInstance.get(`/order/${id_ortder}/details`)
  },
  getOrderById: function (id_ortder) {
    return axiosInstance.get(`/order/${id_ortder}`)
  },
  createOrder: function (order) {
    return axiosInstance.post(`/order/`, order)
  },
  updateOrder: function (id_order, order) {
    return axiosInstance.put(`/order/${id_order}`, order)
  },
  createOrderDetails: function (id_order, details, type_format) {
    return axiosInstance.post(`/order_detail/file/${id_order}/${type_format}`, details, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  getOrderDetailsByBrandAndIdOrder: function (id_order) {
    return axiosInstance.get(`/order_detail/by_brand/${id_order}`)
  },
  getOrderDetailsByDescriptionAndIdOrder: function (id_order) {
    return axiosInstance.get(`/order_detail/by_description/${id_order}`)
  },
  getOrderDetailsBySizeAndIdOrder: function (id_order) {
    return axiosInstance.get(`/order_detail/by_size/${id_order}`)
  }
}
