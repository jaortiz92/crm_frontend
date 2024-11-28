<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { useActivityStore } from '@/stores/activityStore'

import { activityService } from '@/services/activityService'
import ActivityInfo from '@/components/activity/ActivityInfo.vue'

const route = useRoute()
const activity = ref(null)
const router = useRouter()
const activityStore = useActivityStore()

onMounted(async () => {
  const idActivity = route.params.id
  activity.value = (await activityService.getActivityById(idActivity)).data
})

const edit = async () => {
  const responseUser = await alertService.editElement(activity.value.id_activity, 'Actividad')
  if (responseUser.isConfirmed) {
    activityStore.setActivity(activity.value)
    router.push('/activityForm')
  }
}
</script>

<template>
  <div v-if="activity">
    <div class="activity">
      <div class="activity-header">
        <ActivityInfo :activity="activity"></ActivityInfo>
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
