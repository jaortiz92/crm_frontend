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
  <div v-if="task" class="task-page">
    <div class="task-card-wrapper">
      <TaskInfo :task="task"></TaskInfo>
    </div>

    <div class="actions-bar">
      <button class="btn btn-primary" @click="edit">Editar</button>
    </div>
  </div>

  <div v-else class="loading">
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.task-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.task-card-wrapper {
  width: 100%;
  margin-bottom: 24px;
}

.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0;
}

.loading {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary, #616161);
}

@media (max-width: 768px) {
  .task-page {
    padding: 20px;
  }
}
</style>
