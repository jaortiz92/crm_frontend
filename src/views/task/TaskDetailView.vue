<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import { taskService } from '@/services/taskService'
import TaskInfo from '@/components/task/TaskInfo.vue'

const route = useRoute()
const task = ref(null)

onMounted(async () => {
  const idTask = route.params.id
  task.value = (await taskService.getTaskById(idTask)).data
})
</script>

<template>
  <div v-if="task">
    <div class="task">
      <div class="task-header">
        <TaskInfo :task="task"></TaskInfo>
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
