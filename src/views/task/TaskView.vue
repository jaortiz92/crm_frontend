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
        task.customer_trip.customer.company_name
          .toLowerCase()
          .includes(filterValues.companyName.toLowerCase())) &&
      (!filterValues.lineName ||
        task.customer_trip.collection.line.line_name
          .toLowerCase()
          .includes(filterValues.lineName.toLowerCase())) &&
      (!filterValues.seller ||
        task.customer_trip.seller.last_name
          .toLowerCase()
          .includes(filterValues.seller.toLowerCase()) ||
        task.customer_trip.seller.first_name
          .toLowerCase()
          .includes(filterValues.seller.toLowerCase())) &&
      (!filterValues.shortCollectionName ||
        task.customer_trip.collection.short_collection_name
          .toLowerCase()
          .includes(filterValues.shortCollectionName.toLowerCase())) &&
      (!filterValues.responsibleUser ||
        task.user_activities.last_name
          .toLowerCase()
          .includes(filterValues.responsibleUser.toLowerCase()) ||
        task.user_activities.first_name
          .toLowerCase()
          .includes(filterValues.responsibleUser.toLowerCase())) &&
      (!filterValues.task ||
        task.task_type.task.toLowerCase().includes(filterValues.task.toLowerCase())) &&
      (!filterValues.city ||
        task.customer_trip.customer.city.city_name
          .toLowerCase()
          .includes(filterValues.city.toLowerCase())) &&
      (!checkboxTouched.completed || task.completed === filterValues.completed) &&
      (!filterValues.creationDateFrom || task.creation_date >= filterValues.creationDateFrom) &&
      (!filterValues.creationDateUntil || task.creation_date <= filterValues.creationDateUntil) &&
      (!filterValues.estimatedDateFrom || task.estimated_date >= filterValues.estimatedDateFrom) &&
      (!filterValues.estimatedDateUntil || task.estimated_date <= filterValues.estimatedDateUntil)
  )
}

addDataUser()
</script>

<template>
  <div class="button-create">
    <button @click="create">Crear</button>
  </div>
  <main>
    <div>
      <h3>Tareas</h3>
      <TaskTable :tasks="tasks" :additionalInfo="true"></TaskTable>
    </div>
    <div>
      <h3>Tareas Asignadas</h3>
      <TaskTable :tasks="tasksAssigned" :additionalInfo="true"></TaskTable>
    </div>

    <div>
      <h3>Todas las Tareas</h3>
      <FilterForm :filterFields="taskFilterFields" @filter="filter" />
      <TaskTable :tasks="filteredTasksAll" :additionalInfo="true"></TaskTable>
    </div>
    {{ filteredTasksAll }}
    {{ tasksAll }}
  </main>
</template>
