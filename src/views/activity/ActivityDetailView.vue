<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import { activityService } from '@/services/activityService'
import ActivityInfo from '@/components/activity/ActivityInfo.vue'

const route = useRoute()
const activity = ref(null)

onMounted(async () => {
  const idActivity = route.params.id
  activity.value = (await activityService.getActivityById(idActivity)).data
})
</script>

<template>
  <div v-if="activity">
    <div class="activity">
      <div class="activity-header">
        <ActivityInfo :activity="activity"></ActivityInfo>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.activity-header {
  max-width: 1800px;
  min-width: 500px;
  margin: 10px;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: var(--border-radius-size);
  box-shadow: 0 2px 10px var(--shadow);
}
</style>
