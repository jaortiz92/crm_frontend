import axiosInstance from '@/plugins/axios'

export const invoiceService = {
  getInvoices: function () {
    return axiosInstance.get(`/invoice/full/`)
  },
  getInvoiceByCutomerTrip: function (id_customer_trip) {
    return axiosInstance.get(`/invoice/customer_trip/${id_customer_trip}`)
  },
  getInvoiceByOrder: function (id_invoice) {
    return axiosInstance.get(`/invoice/invoice/${id_invoice}`)
  },
  getInvoiceWithDetails: function (id_invoice) {
    return axiosInstance.get(`/invoice/${id_invoice}/details`)
  },
  createInvoice: function (invoice) {
    return axiosInstance.post(`/invoice/`, invoice)
  },
  updateInvoice: function (id_invoice, invoice) {
    return axiosInstance.put(`/invoice/${id_invoice}`, invoice)
  }
}
