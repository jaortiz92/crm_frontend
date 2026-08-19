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
import ActivityKanban from '@/components/activity/ActivityKanban.vue'

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
  <div class="home-page">
    <div class="detail-section">
      <CollectionSummary :collectionSummary="collectionSummary"> </CollectionSummary>
    </div>

    <div class="detail-section">
      <ActivityKanban :pendingActivities="pendingActivities" :activityTypes="activityTypes">
      </ActivityKanban>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Actividades Pendientes</h2>
      </div>
      <ActivityTable :activities="pendingActivitiesMe" :additionalInfo="true"></ActivityTable>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Tareas Pendientes</h2>
      </div>
      <TasksTable :tasks="pendingTasks"></TasksTable>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Tareas Asignadas Pendientes</h2>
      </div>
      <TasksTable :tasks="pendingAssignedTasks"></TasksTable>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.detail-section {
  margin-bottom: 32px;
}

@media (max-width: 768px) {
  .home-page {
    padding: 20px;
  }
}
</style>
