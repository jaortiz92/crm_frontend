import axiosInstance from '@/plugins/axios'

export const shipmentService = {
  getShipments: function () {
    return axiosInstance.get(`/shipment/full/?skip=0&limit=1000`)
  },
  getShipmentById: function (id_shipment) {
    return axiosInstance.get(`/shipment/full/${id_shipment}`)
  },
  createShipment: function (shipment) {
    return axiosInstance.post(`/shipment/`, shipment)
  },
  updateShipment: function (id_shipment, shipment) {
    return axiosInstance.put(`/shipment/${id_shipment}`, shipment)
  }
}
