import axiosInstance from '@/plugins/axios'

export const invoiceService = {
  getInvoices: function () {
    return axiosInstance.get(`/invoice/full/`)
  },
  getInvoiceByCutomerTrip: function (id_customer_trip) {
    return axiosInstance.get(`/invoice/customer_trip/${id_customer_trip}`)
  },
  getInvoiceByOrder: function (id_order) {
    return axiosInstance.get(`/invoice/order/${id_order}`)
  },
  getInvoiceWithDetails: function (id_invoice) {
    return axiosInstance.get(`/invoice/${id_invoice}/details`)
  }
}
