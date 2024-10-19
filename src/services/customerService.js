import axiosInstance from '@/plugins/axios'

export const customerService = {
  getCustomers: function (skip, limit) {
    return axiosInstance.get(`/customer/?skip=${skip}&limit=${limit}`)
  },
  getCustomerFull: function (id_customer) {
    return axiosInstance.get(`/customer/full/${id_customer}`)
  }
}
