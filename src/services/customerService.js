import axiosInstance from '@/plugins/axios'

export const customerService = {
  getCustomers: function (skip, limit) {
    return axiosInstance.get(`/customer/?skip=${skip}&limit=${limit}`)
  },
  getCustomerFull: function (id_customer) {
    return axiosInstance.get(`/customer/full/${id_customer}`)
  },
  getContactsByCustomer: function (id_customer) {
    return axiosInstance.get(`/contact/customer/${id_customer}`)
  },
  getContactsById: function (id_contact) {
    return axiosInstance.get(`/contact/full/${id_contact}`)
  },
  createCustomer: function (customer) {
    return axiosInstance.post(`/customer/`, customer)
  },
  updateCustomer: function (id_customer, customer) {
    return axiosInstance.put(`/customer/${id_customer}`, customer)
  },
  createContact: function (contact) {
    return axiosInstance.post(`/contact/`, contact)
  },
  updateContact: function (id_contact, contact) {
    return axiosInstance.put(`/contact/${id_contact}`, contact)
  }
}
