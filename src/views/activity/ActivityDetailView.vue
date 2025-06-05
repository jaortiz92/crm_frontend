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
  <div v-if="activity">
    <div class="activity">
      <div class="activity-header">
        <ActivityInfo :activity="activity"></ActivityInfo>
      </div>
      <div class="button-edit">
        <button
          v-if="
            userStore.hasRole(['Gerente', 'Financiero', 'Administrador']) && activity.budget > 0
          "
          @click="showAutho = !showAutho"
        >
          Autorizar
        </button>
        <button @click="edit">Editar</button>
      </div>
      <div v-if="showAutho">
        <ActivityFormAutho
          :activity="activity"
          @authorizeActivity="authorizeActivity"
        ></ActivityFormAutho>
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

.button-edit button {
  margin-left: 10px;
}
</style>
