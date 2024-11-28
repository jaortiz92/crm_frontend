<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useTaskStore } from '@/stores/taskStore'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import TaskFrom from '@/components/task/TaskForm.vue'

import { customerService } from '@/services/customerService'
import { userService } from '@/services/userService'
import { taskService } from '@/services/taskService'

const options = ref({
  customers: [],
  users: []
})
const task = ref({})
const isEdit = ref(false)
const router = useRouter()

const userStore = useUserStore()
const taskStore = useTaskStore()

if (taskStore.isThereTask()) {
  task.value = taskStore.getTask()
  isEdit.value = true
} else {
  task.value = basicModels.task
}

onMounted(async () => {
  options.value.customers = (await customerService.getCustomers(0, 1000)).data
  options.value.users = (await userService.getUsers(0, 1000)).data
})

const save = async (task) => {
  if (!task.completed) {
    task.execution_date = null
  }

  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Tarea')
    if (responseUser.isConfirmed) {
      try {
        task.id_creator = userStore.user.id_user
        task.creation_date = new Date().toISOString().split('T')[0]
        const response = await taskService.createTask(task)
        const id = response.data.id_task
        alertService.generalSucces(`La Tarea fue creadá exitosamente con el ID ${id}`)
        router.push(`task/${id}`)
      } catch {
        alertService.generalError(`La Tarea no pudo ser creada.`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(task.id_task, 'Tarea')
    if (responseUser.isConfirmed) {
      try {
        await taskService.updateTask(task.id_task, task)
        alertService.generalSucces(`La Tarea con ID ${task.id_task}, fue actualizada exitosamente`)
        router.push(`task/${task.id_task}`)
      } catch {
        alertService.generalError(`La Tarea con ID ${task.id_task}, no pudo ser actualizada`)
      }
    }
  }
}
</script>

<template>
  <div>
    <h2>{{ isEdit ? `Actualizar Tarea: ID ${task.id_task}` : 'Crear Tarea' }}</h2>
    <TaskFrom :initialTask="task" :options="options" :isEdit="isEdit" @save="save"></TaskFrom>
  </div>
</template>
