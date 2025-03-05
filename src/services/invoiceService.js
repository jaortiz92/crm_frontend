import axiosInstance from '@/plugins/axios'

export const invoiceService = {
  getInvoices: function () {
    return axiosInstance.get(`/invoice/full/?skip=0&limit=100`)
  },
  getInvoiceByCutomerTrip: function (id_customer_trip) {
    return axiosInstance.get(`/invoice/customer_trip/${id_customer_trip}`)
  },
  getInvoiceByOrder: function (id_invoice) {
    return axiosInstance.get(`/invoice/order/${id_invoice}`)
  },
  getInvoiceWithDetails: function (id_invoice) {
    return axiosInstance.get(`/invoice/${id_invoice}/details`)
  },
  createInvoice: function (invoice) {
    return axiosInstance.post(`/invoice/`, invoice)
  },
  updateInvoice: function (id_invoice, invoice) {
    return axiosInstance.put(`/invoice/${id_invoice}`, invoice)
  },
  createInvoiceDetails: function (id_invoice, details) {
    return axiosInstance.post(`/invoice_detail/file/${id_invoice}`, details, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  getInvoiceDetailsByBrandAndIdInvoice: function (id_invoice) {
    return axiosInstance.get(`/invoice_detail/by_brand/${id_invoice}`)
  },
  getInvoiceDetailsByDescriptionAndIdInvoice: function (id_invoice) {
    return axiosInstance.get(`/invoice_detail/by_description/${id_invoice}`)
  },
  getInvoiceDetailsBySizeAndIdInvoice: function (id_invoice) {
    return axiosInstance.get(`/invoice_detail/by_size/${id_invoice}`)
  }
}
