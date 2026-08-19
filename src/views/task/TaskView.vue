<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useTaskStore } from '@/stores/taskStore'

import TaskTable from '@/components/task/TaskTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { taskService } from '@/services/taskService'
import { filterFormat } from '@/plugins/filterFormat'

const userStore = useUserStore()
const id_user = ref('')
const tasks = ref([])
const tasksAssigned = ref([])
const tasksAll = ref([])
const filteredTasksAll = ref([])
const router = useRouter()
const taskStore = useTaskStore()

const addTasks = async () => {
  try {
    const response = await taskService.getTasks(id_user.value)
    tasks.value = response.data
  } catch (error) {
    alertService.generalError('Las tareas no se pudieron cargar')
  }
}

const addAssignedTasks = async () => {
  try {
    const response = await taskService.getAssignedTasks(id_user.value)
    tasksAssigned.value = response.data
  } catch (error) {
    alertService.generalError('Las tareas no se pudieron cargar')
  }
}

const addAllTasks = async () => {
  try {
    const response = await taskService.getAllTasks()
    tasksAll.value = response.data
    filteredTasksAll.value = [...tasksAll.value]
  } catch (error) {
    alertService.generalError('Las tareas no se pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addTasks()
    addAssignedTasks()
    addAllTasks()
  }
}

const create = () => {
  taskStore.clearTask()
  router.push('/taskForm')
}

const taskFilterFields = [
  filterFormat.companyName,
  filterFormat.creatorUser,
  filterFormat.task,
  filterFormat.city,
  filterFormat.responsibleUser,
  filterFormat.creationDateFrom,
  filterFormat.creationDateUntil,
  filterFormat.completedDateFrom,
  filterFormat.completedDateUntil,
  filterFormat.completed
]

const filter = (filterValues, checkboxTouched) => {
  filteredTasksAll.value = tasksAll.value.filter(
    (task) =>
      (!filterValues.companyName ||
        task.customer.company_name
          .toLowerCase()
          .includes(filterValues.companyName.toLowerCase())) &&
      (!filterValues.creatorUser ||
        task.creator_tasks.last_name
          .toLowerCase()
          .includes(filterValues.creatorUser.toLowerCase()) ||
        task.creator_tasks.first_name
          .toLowerCase()
          .includes(filterValues.creatorUser.toLowerCase())) &&
      (!filterValues.task || task.task.toLowerCase().includes(filterValues.task.toLowerCase())) &&
      (!filterValues.city ||
        task.customer.city.city_name.toLowerCase().includes(filterValues.city.toLowerCase())) &&
      (!filterValues.responsibleUser ||
        task.responsible_task.last_name
          .toLowerCase()
          .includes(filterValues.responsibleUser.toLowerCase()) ||
        task.responsible_task.first_name
          .toLowerCase()
          .includes(filterValues.responsibleUser.toLowerCase())) &&
      (!checkboxTouched.completed || task.completed === filterValues.completed) &&
      (!filterValues.creationDateFrom || task.creation_date >= filterValues.creationDateFrom) &&
      (!filterValues.creationDateUntil || task.creation_date <= filterValues.creationDateUntil) &&
      (!filterValues.completedDateFrom || task.execution_date >= filterValues.completedDateFrom) &&
      (!filterValues.completedDateUntil || task.execution_date <= filterValues.completedDateUntil)
  )
}

addDataUser()
</script>

<template>
  <div class="list-page">
    <div class="page-header">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Tareas</h2>
      </div>
      <div class="actions-bar">
        <button class="btn btn-primary" @click="create">Crear</button>
      </div>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h3 class="section-title">Mis Tareas</h3>
      </div>
      <TaskTable :tasks="tasks" :additionalInfo="true"></TaskTable>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h3 class="section-title">Tareas Asignadas</h3>
      </div>
      <TaskTable :tasks="tasksAssigned" :additionalInfo="true"></TaskTable>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h3 class="section-title">Todas las Tareas</h3>
      </div>
      <FilterForm :filterFields="taskFilterFields" @filter="filter" />
      <TaskTable :tasks="filteredTasksAll" :additionalInfo="true"></TaskTable>
    </div>
  </div>
</template>

<style scoped>
.list-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.detail-section {
  margin-bottom: 32px;
}

@media (max-width: 768px) {
  .list-page {
    padding: 20px;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
