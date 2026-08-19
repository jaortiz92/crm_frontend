<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'

import { alertService } from '@/services/alertService'

import { useActivityStore } from '@/stores/activityStore'

import { activityService } from '@/services/activityService'

import ActivityInfo from '@/components/activity/ActivityInfo.vue'
import ActivityFormAutho from '@/components/activity/ActivityFormAutho.vue'

const route = useRoute()
const activity = ref(null)
const router = useRouter()
const activityStore = useActivityStore()
const userStore = useUserStore()
const showAutho = ref(false)

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

const authorizeActivity = async (activityAutho) => {
  activityAutho.authorizer = userStore.user.id_user
  try {
    const response = await activityService.authorizeActivity(
      activity.value.id_activity,
      activityAutho
    )
    const id = response.data.id_activity
    alertService.generalSucces(`La Actividad con el ID ${id}, fue autorizadá exitosamente`)
    router.push(`/activity/${id}`)
  } catch {
    alertService.generalError(
      `La Actividad con ID ${activityAutho.id_activity}, no pudo ser autorizada`
    )
  }
}
</script>

<template>
  <div v-if="activity" class="activity-page">
    <div class="activity-card-wrapper">
      <ActivityInfo :activity="activity"></ActivityInfo>
    </div>

    <div class="actions-bar">
      <button
        v-if="userStore.hasRole(['Gerente', 'Financiero', 'Administrador']) && activity.budget > 0"
        class="btn btn-outline"
        @click="showAutho = !showAutho"
      >
        Autorizar
      </button>
      <button class="btn btn-primary" @click="edit">Editar</button>
    </div>

    <div v-if="showAutho" class="detail-section">
      <ActivityFormAutho
        :activity="activity"
        @authorizeActivity="authorizeActivity"
      ></ActivityFormAutho>
    </div>
  </div>

  <div v-else class="loading">
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.activity-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.activity-card-wrapper {
  width: 100%;
  margin-bottom: 24px;
}

.detail-section {
  margin-bottom: 32px;
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
  .activity-page {
    padding: 20px;
  }
}
</style>
