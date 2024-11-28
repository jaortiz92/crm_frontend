import axiosInstance from '@/plugins/axios'

export const paymentMethodService = {
  getPaymentMethodService: function () {
    return axiosInstance.get(`/payment_method/?skip=0&limit=40`)
  }
}
