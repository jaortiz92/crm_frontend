import axiosInstance from '@/plugins/axios'

export const activityService = {
  pendingActivities: function (id_user) {
    return axiosInstance.get(`/activity/query/?id_user=${id_user}&completed=false`)
  }
}