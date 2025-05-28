<script setup>
import { defineProps, toRefs, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useActivityStore } from '@/stores/activityStore'

import { alertService } from '@/services/alertService'
import { activityService } from '@/services/activityService'

const props = defineProps({
  pendingActivities: {
    type: Array,
    default: () => []
  },
  activityTypes: {
    type: Array,
    default: () => []
  }
})

const router = useRouter()
const activityStore = useActivityStore()
const topScroll = ref(null)
const mainScroll = ref(null)
const categoryActivityTypeFilter = ref('Todas')
const activityTypesFiltered = ref([])
const categoryActivityTypes = ref([])
const { pendingActivities, activityTypes } = toRefs(props)

const draggedActivity = ref(null)

const edit = async (activity) => {
  activityStore.setActivity(activity)
  router.push('/activityForm')
}

const goToCustomer = async (id_customer) => {
  router.push({ name: 'CustomerDetail', params: { id: id_customer } })
}

const goToCustomerTrip = async (id_customer_trip) => {
  router.push({ name: 'CustomerTripDetail', params: { id: id_customer_trip } })
}

const updateKambaCategory = () => {
  if (categoryActivityTypeFilter.value === 'Todas') {
    activityTypesFiltered.value = activityTypes.value
  } else {
    activityTypesFiltered.value = activityTypes.value.filter(
      (item) => item.category === categoryActivityTypeFilter.value
    )
  }
}

const saveUpdate = async (activity) => {
  await activityService.updateActivity(activity.id_activity, activity)
  alertService.generalSucces(
    `La Actividad con ID ${activity.id_activity}, fue actualizada exitosamente`
  )
}

const syncScroll = (e) => {
  if (e.target === topScroll.value) {
    mainScroll.value.scrollLeft = topScroll.value.scrollLeft
  } else if (e.target === mainScroll.value) {
    topScroll.value.scrollLeft = mainScroll.value.scrollLeft
  }
}

const handleDragStart = (activity) => {
  draggedActivity.value = activity
}

const handleDrop = async (targetType) => {
  if (!draggedActivity.value) return
  if (draggedActivity.value.id_activity_type === targetType.id_activity_type) return

  const responseUser = await alertService.generalQuestionThree(
    'Cambiar Tarea',
    `¿Esta seguro que quiere cambiar actividad con ID ${draggedActivity.value.id_activity}, sin completar la tarea?`
  )

  if (responseUser.isConfirmed) {
    const original_id_activity_type = draggedActivity.value.id_activity_type
    try {
      draggedActivity.value.id_activity_type = targetType.id_activity_type
      saveUpdate(draggedActivity.value)
      draggedActivity.value.activity_type = targetType
    } catch {
      draggedActivity.value.id_activity_type = original_id_activity_type
    }
  } else if (responseUser.isDismissed) {
    edit(draggedActivity.value)
  }

  draggedActivity.value = null
}

const allowDrop = (event) => {
  event.preventDefault()
}

onMounted(() => {
  if (topScroll.value && mainScroll.value) {
    topScroll.value.addEventListener('scroll', syncScroll)
    mainScroll.value.addEventListener('scroll', syncScroll)
  }
})

watch(activityTypes, () => {
  categoryActivityTypes.value = [
    ...new Set(activityTypes.value.map((item) => item.category))
  ].sort()
  updateKambaCategory()
})
</script>

<template>
  <div class="field-input">
    <label>Categoria</label>
    <select v-model="categoryActivityTypeFilter" @change="updateKambaCategory">
      <option>Todas</option>
      <option v-for="option in categoryActivityTypes" :key="option" :value="option">
        {{ option }}
      </option>
    </select>
  </div>

  <div class="kanban-board-wrapper">
    <div class="kanban-board-scroll" ref="topScroll">
      <div class="kanban-board"><p></p></div>
    </div>

    <div class="kanban-board-scroll" ref="mainScroll">
      <div class="kanban-board">
        <div
          v-for="(column, index) in activityTypesFiltered"
          :key="column.activity"
          class="kanban-column"
          @dragover="allowDrop"
          @drop="handleDrop(column)"
        >
          <h3>{{ column.category }}</h3>
          <h3>{{ index + 1 }}) {{ column.activity_order }}.{{ column.activity }}</h3>
          <h4>
            Clientes:
            <strong>{{
              pendingActivities.filter(
                (activity) => activity.activity_type.activity_order === column.activity_order
              ).length
            }}</strong>
          </h4>

          <div
            v-for="activity in pendingActivities.filter(
              (activity) => activity.activity_type.activity_order === column.activity_order
            )"
            :key="activity.id_activity"
            class="kanban-card"
            draggable="true"
            @dragstart="handleDragStart(activity)"
          >
            <div class="kanban-card-item">
              <p>...</p>
            </div>
            <div @click="goToCustomer(activity.customer_trip.id_customer)" class="kanban-card-item">
              <h3>{{ activity.customer_trip.customer.company_name }}</h3>
            </div>
            <div @click="goToCustomerTrip(activity.id_customer_trip)" class="kanban-card-item">
              <p>
                <strong
                  >{{ activity.customer_trip.collection.short_collection_name }} => ID Viaje:
                  {{ activity.customer_trip.id_customer_trip }}
                </strong>
              </p>
            </div>
            <div @click="edit(activity)" class="kanban-card-item">
              <p>Fecha Estimada: {{ activity.estimated_date }}</p>
              <p>
                Responsable: {{ activity.user_activities.first_name }}
                {{ activity.user_activities.last_name }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban-board {
  font-size: 70%;
  display: flex;
  gap: 1rem;
  width: 3500px;
}

.kanban-column {
  min-width: 200px;
  background-color: var(--background-light);
  border-radius: 8px;
  padding: 1rem;
}

.kanban-card {
  background-color: var(--text-white);
  border-radius: 8px;
  padding: 1px;
  margin-bottom: 6px;
}

.kanban-card:hover {
  background-color: var(--light-color-opposite-one);
  transition: background-color 0.3s ease;
  cursor: pointer;
}

.kanban-card p {
  margin: 6px;
}

.kanban-card h4 {
  margin: 8px;
}

.kanban-card-item h3,
p {
  white-space: normal;
  word-break: break-word;
}

.kanban-card-item:hover {
  color: var(--text-white);
  background-color: var(--light-color-opposite-two);
  transition: background-color 0.3s ease;
  cursor: pointer;
  border-radius: 8px;
  padding: 0.5%;
  font-weight: bold;
}

.kanban-board-wrapper {
  display: flex;
  flex-direction: column;
}

.kanban-board-scroll {
  overflow-x: auto;
  white-space: nowrap;
}

.field-input {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
}

.field-input label {
  font-size: 100%;
  margin-bottom: 6px;
  font-weight: 600;
  color: var(--text-gray);
}

.field-input select {
  padding: 10px 12px;
  font-size: 90%;
  border: 1px solid var(--gray-border);
  border-radius: 6px;
  background-color: var(--background-white);
  color: var(--text-gray);
  outline: none;
}

.field-input select:focus {
  border-color: var(--light-color);
  background-color: var(--background-white);
  box-shadow: 0 0 5px var(--shadow);
}
</style>
