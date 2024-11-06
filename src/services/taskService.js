import axiosInstance from '@/plugins/axios'

export const taskService = {
  pendingTasks: function (id_user) {
    return axiosInstance.get(`/task/query/?id_responsible=${id_user}&completed=false`)
  },
  pendingAssignedTasks: function (id_user) {
    return axiosInstance.get(`/task/query/?id_creator=${id_user}&completed=false`)
  },
  getTasks: function (id_user) {
    return axiosInstance.get(`/task/query/?id_responsible=${id_user}`)
  },
  getAssignedTasks: function (id_user) {
    return axiosInstance.get(`/task/query/?id_creator=${id_user}`)
  }
}
