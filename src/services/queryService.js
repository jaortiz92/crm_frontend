import axiosInstance from '@/plugins/axios'

export const queryService = {
  validateCustomers: function (file) {
    return axiosInstance.post(`/query/validate_customers`, file, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  }
}
