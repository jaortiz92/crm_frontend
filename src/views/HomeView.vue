<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import TasksTable from '@/components/task/TaskTable.vue'
import ActivityTable from '@/components/activity/ActivityTable.vue'

import { activityService } from '@/services/activityService'
import { alertService } from '@/services/alertService'
import { taskService } from '@/services/taskService'
import { collectionService } from '@/services/collectionService'
import CollectionSummary from '@/components/collection/CollectionSummary.vue'
import ActivityKamba from '@/components/activity/ActivityKamba.vue'

const userStore = useUserStore()
const id_user = ref('')
const pendingActivities = ref([])
const pendingActivitiesMe = ref([])
const pendingTasks = ref([])
const pendingAssignedTasks = ref([])
const collectionSummary = ref([])
const activityTypes = ref([])

const addPendingActivities = async () => {
  try {
    let response = await activityService.pendingActivitiesMe(id_user.value)
    pendingActivitiesMe.value = response.data
    response = await activityService.pendingActivities()
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

const addActivityTypes = async () => {
  try {
    const response = await activityService.getActivityTypesMandatory()
    activityTypes.value = response.data
  } catch (error) {
    alertService.generalError('Los tipos de actividades no se pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addPendingActivities()
    addActivityTypes()
    addPendingTasks()
    addPendingAssignedTasks()
  }
}

onMounted(async () => {
  collectionSummary.value = (await collectionService.getCollectionSummary()).data
  addDataUser()
})
</script>

<template>
  <main>
    <div>
      <h3>Resumen Colecciones</h3>
      <CollectionSummary :collectionSummary="collectionSummary"> </CollectionSummary>
    </div>
    <div>
      <ActivityKamba :pendingActivities="pendingActivities" :activityTypes="activityTypes">
      </ActivityKamba>
    </div>

    <div>
      <h3>Actividades Pendientes</h3>
      <ActivityTable :activities="pendingActivitiesMe" :additionalInfo="true"></ActivityTable>
    </div>
    <div>
      <h3>Tareas Pendientes</h3>
      <TasksTable :tasks="pendingTasks"></TasksTable>
    </div>
    <div>
      <h3>Tareas Asignadas Pendientes</h3>
      <TasksTable :tasks="pendingAssignedTasks"></TasksTable>
    </div>
  </main>
</template>
