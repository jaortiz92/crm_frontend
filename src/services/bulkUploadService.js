import axiosInstance from '@/plugins/axios'

export const bulkUploadService = {
  CreateCustomers: function (file) {
    return axiosInstance.post(`/customer/file/customersTemplate/create`, file, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  UpdateCustomers: function (file) {
    return axiosInstance.post(`/customer/file/customersTemplate/update`, file, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  }
}
