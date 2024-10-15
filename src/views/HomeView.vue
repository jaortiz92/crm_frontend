<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import PendingTasks from '@/components/TasksTable.vue'
import ActivityTable from '@/components/ActivityTable.vue'

import { activityService } from '@/services/activityService'
import { alertService } from '@/services/alertService'
import { taskService } from '@/services/taskService'

const userStore = useUserStore()
const id_user = ref('')
const pendingActivities = ref([])
const pendingTasks = ref([])
const pendingAssignedTasks = ref([])

const addPendingActivities = async () => {
  try {
    const response = await activityService.pendingActivities(id_user.value)
    pendingActivities.value = response.data
  } catch (error) {
    alertService.generalError('Las actividades no se pudieron cargar')
  }
}

const addPendingTasks = async () => {
  try {
    const response = await taskService.pendingTasks(id_user.value)
    pendingTasks.value = response.data
  } catch (error) {
    alertService.generalError('Las Tareas pendientes no se pudieron cargar')
  }
}

const addPendingAssignedTasks = async () => {
  try {
    const response = await taskService.pendingAssignedTasks(id_user.value)
    pendingAssignedTasks.value = response.data
  } catch (error) {
    alertService.generalError('Las Tareas asignadas pendientes no se pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addPendingActivities()
    addPendingTasks()
    addPendingAssignedTasks()
  }
}

addDataUser()
</script>

<template>
  <main>
    <div>
      <h3>Actividades Pendientes</h3>
      <ActivityTable :activities="pendingActivities"></ActivityTable>
    </div>
    <div>
      <h3>Tareas Pendientes</h3>
      <PendingTasks :tasks="pendingTasks"></PendingTasks>
    </div>
    <div>
      <h3>Tareas Asignadas Pendientes</h3>
      <PendingTasks :tasks="pendingAssignedTasks"></PendingTasks>
    </div>
  </main>
</template>
