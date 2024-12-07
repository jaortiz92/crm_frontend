import axiosInstance from '@/plugins/axios'

export const activityService = {
  pendingActivities: function (id_user) {
    return axiosInstance.get(`/activity/query/?id_user=${id_user}&completed=false`)
  },
  getActivitiesByCutomerTrip: function (id_customer_trip) {
    return axiosInstance.get(`/activity/customer_trip/${id_customer_trip}`)
  },
  getActivities: function (id_user) {
    return axiosInstance.get(`/activity/query/?id_user=${id_user}`)
  },
  getActivityById: function (id_activity) {
    return axiosInstance.get(`/activity/full/${id_activity}`)
  },
  createActivity: function (activity) {
    return axiosInstance.post(`/activity/`, activity)
  },
  updateActivity: function (id_activity, activity) {
    return axiosInstance.put(`/activity/${id_activity}`, activity)
  },
  getActivityTypes: function () {
    return axiosInstance.get(`/activity_type/?skip=0&limit=100`)
  }
}
