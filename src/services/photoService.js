import axiosInstance from '@/plugins/axios'

export const photoService = {
  getPhotos: function (skip, limit) {
    return axiosInstance.get(`/role/?skip=${skip}&limit=${limit}`)
  },
  getPhotoById: function (id_role) {
    return axiosInstance.get(`/role/${id_role}`)
  },
  getPhotoByIdCustomer: function (id_customer) {
    return axiosInstance.get(`/photo/customer/${id_customer}`)
  },
  createPhoto: function (photo) {
    return axiosInstance.post(`/photo/`, photo)
  },
  updatePhoto: function (id_photo, photo) {
    return axiosInstance.put(`/photo/${id_photo}`, photo)
  }
}
