<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import ActivityTable from '@/components/activity/ActivityTable.vue'

import { alertService } from '@/services/alertService'
import { activityService } from '@/services/activityService'

const userStore = useUserStore()
const id_user = ref('')
const activities = ref([])

const addActivities = async () => {
  try {
    const response = await activityService.getActivities(id_user.value)
    activities.value = response.data
  } catch (error) {
    alertService.generalError('Las actividades no se pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addActivities()
  }
}

addDataUser()
</script>

<template>
  <main>
    <div>
      <h3>Actividades</h3>
      <ActivityTable :activities="activities" :additionalInfo="true"></ActivityTable>
    </div>
  </main>
</template>
