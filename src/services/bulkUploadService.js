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
  },
  CreateCustomerTrips: function (file) {
    return axiosInstance.post(`/customer_trip/file/customerTripsTemplate/create`, file, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  UpdateCustomerTrips: function (file) {
    return axiosInstance.post(`/customer_trip/file/customerTripsTemplate/update`, file, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  }
}
