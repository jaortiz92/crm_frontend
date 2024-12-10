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
  },
  getAllTasks: function () {
    return axiosInstance.get(`/task/full/?skip=0&limit=1000`)
  },
  getTaskById: function (id_task) {
    return axiosInstance.get(`/task/full/${id_task}`)
  },
  createTask: function (task) {
    return axiosInstance.post(`/task/`, task)
  },
  updateTask: function (id_task, task) {
    return axiosInstance.put(`/task/${id_task}`, task)
  }
}
