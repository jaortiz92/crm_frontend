<script setup>
import { defineProps, computed, toRefs } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  activities: {
    type: Array,
    default: () => []
  }
})

const { activities } = toRefs(props)
const router = useRouter()

const filteredActivities = computed(() =>
  activities.value.filter((activity) => activity.comment && activity.comment.trim() !== '')
)

const goToActivity = async (id_activity) => {
  router.push({ name: 'ActivityDetail', params: { id: id_activity } })
}
</script>

<template>
  <div class="activities-container">
    <div class="cards-grid">
      <div
        @click="goToActivity(activity.id_activity)"
        v-for="(activity, index) in filteredActivities"
        :key="index"
        class="activity-card"
      >
        <p class="comment"><strong>Comentario:</strong> {{ activity.comment }}</p>
        <p class="user">
          <strong>Usuario:</strong> {{ activity.user_activities?.username || 'Unknown user' }}
        </p>
        <p class="activity-type">
          <strong>Actividad:</strong>
          {{ activity.activity_type?.activity || 'Unknown activity type' }}
        </p>
        <p class="date"><strong>Fecha Creación:</strong> {{ activity.creation_date }}</p>
      </div>
    </div>
    <p v-if="filteredActivities.length === 0">Sin comentarios</p>
  </div>
</template>

<style scoped>
.cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

@media (max-width: 1024px) {
  .cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .cards-grid {
    grid-template-columns: 1fr;
  }
}

.activity-card {
  background-color: var(--background-white);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0px 2px 6px var(--shadow);
}

.activity-card:hover {
  background-color: var(--light-color-opposite-one);
  transition: background-color 0.3s ease;
  cursor: pointer;
}

.comment,
.user,
.activity-type,
.date {
  margin: 0.5rem 0;
}
</style>
