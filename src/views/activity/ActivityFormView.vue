<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useActivityStore } from '@/stores/activityStore'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import ActivityFrom from '@/components/activity/ActivityForm.vue'

import { customerService } from '@/services/customerService'
import { userService } from '@/services/userService'
import { activityService } from '@/services/activityService'

const options = ref({
  customers: [],
  users: [],
  activityTypes: []
})
const activity = ref({})
const isEdit = ref(false)
const router = useRouter()

const userStore = useUserStore()
const activityStore = useActivityStore()

if (activityStore.isThereActivity()) {
  activity.value = activityStore.getActivity()
  isEdit.value = true
} else {
  activity.value = basicModels.activity
}

onMounted(async () => {
  options.value.customers = (await customerService.getCustomers(0, 1000)).data
  options.value.users = (await userService.getUsers(0, 1000)).data
  options.value.activityTypes = (await activityService.getActivityTypes()).data
})

const save = async (activity) => {
  if (!activity.completed) {
    activity.execution_date = null
  }

  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Actividad')
    if (responseUser.isConfirmed) {
      activity.id_creator = userStore.user.id_user
      activity.creation_date = new Date().toISOString().split('T')[0]
      const response = await activityService.createActivity(activity)
      if (response.status === 200) {
        const id = response.data.id_activity
        alertService.generalSucces(`La Actividad fue creadá exitosamente con el ID ${id}`)
        router.push(`activity/${id}`)
      } else {
        alertService.generalError(`La Actividad no pudo ser creada`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(activity.id_activity, 'Actividad')
    if (responseUser.isConfirmed) {
      const response = await activityService.updateActivity(activity.id_activity, activity)
      if (response.status === 200) {
        alertService.generalSucces(
          `La Actividad con ID ${activity.id_activity}, fue actualizada exitosamente`
        )
        router.push(`activity/${activity.id_activity}`)
      } else {
        alertService.generalError(
          `La Actividad con ID ${activity.id_activity}, no pudo ser actualizada`
        )
      }
    }
  }
}
</script>

<template>
  <div>
    <h2>{{ isEdit ? `Actualizar Actividad: ID ${activity.id_activity}` : 'Crear Actividad' }}</h2>
    <ActivityFrom
      :initialActivity="activity"
      :options="options"
      :isEdit="isEdit"
      @save="save"
    ></ActivityFrom>
  </div>
</template>
