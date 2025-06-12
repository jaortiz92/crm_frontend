import axiosInstance from '@/plugins/axios'

export const activityService = {
  pendingActivities: function () {
    return axiosInstance.get(`/activity/pending/full/`)
  },
  pendingActivitiesMe: function (id_user) {
    return axiosInstance.get(`/activity/query/?id_user=${id_user}&completed=false`)
  },
  getActivitiesByCutomerTrip: function (id_customer_trip) {
    return axiosInstance.get(`/activity/customer_trip/${id_customer_trip}`)
  },
  getActivities: function () {
    return axiosInstance.get(`/activity/full/?skip=0&limit=1000`)
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
  },
  getActivityTypesMandatory: function () {
    return axiosInstance.get(`/activity_type/mandatory/`)
  },
  createActivityType(activityType) {
    return axiosInstance.post('/activity_type/', activityType)
  },
  updateActivityType(idActivityType, activityType) {
    return axiosInstance.put(`/activity_type/${idActivityType}`, activityType)
  },
  deleteActivityType(idActivityType) {
    return axiosInstance.delete(`/activity_type/${idActivityType}`)
  },
  getActivitiesByCustomer: function (id_customer) {
    return axiosInstance.get(`/activity/query/?id_customer=${id_customer}`)
  },
  authorizeActivity: function (id_activity, activityAutho) {
    return axiosInstance.put(`/activity/authorize/${id_activity}`, activityAutho)
  }
}
