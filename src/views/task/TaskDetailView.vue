<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { useTaskStore } from '@/stores/taskStore'

import { taskService } from '@/services/taskService'
import TaskInfo from '@/components/task/TaskInfo.vue'

const route = useRoute()
const task = ref(null)
const router = useRouter()
const taskStore = useTaskStore()

onMounted(async () => {
  const idTask = route.params.id
  task.value = (await taskService.getTaskById(idTask)).data
})

const edit = async () => {
  const responseUser = await alertService.editElement(task.value.id_task, 'Tarea')
  if (responseUser.isConfirmed) {
    taskStore.setTask(task.value)
    router.push('/taskForm')
  }
}
</script>

<template>
  <div v-if="task">
    <div class="task">
      <div class="task-header">
        <TaskInfo :task="task"></TaskInfo>
      </div>
      <div class="button-edit">
        <button @click="edit">Editar</button>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.task-header {
  max-width: 1800px;
  min-width: 500px;
  margin: 10px;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: var(--border-radius-size);
  box-shadow: 0 2px 10px var(--shadow);
}
</style>
