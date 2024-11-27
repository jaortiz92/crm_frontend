<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useTaskStore } from '@/stores/taskStore'

import TaskTable from '@/components/task/TaskTable.vue'

import { alertService } from '@/services/alertService'
import { taskService } from '@/services/taskService'

const userStore = useUserStore()
const id_user = ref('')
const tasks = ref([])
const tasksAssigned = ref([])
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

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addTasks()
    addAssignedTasks()
  }
}

const create = () => {
  taskStore.clearTask()
  router.push('/taskForm')
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
  </main>
</template>
