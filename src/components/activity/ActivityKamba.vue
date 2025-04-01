<script setup>
import { defineProps, toRefs, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useActivityStore } from '@/stores/activityStore'

import { alertService } from '@/services/alertService'

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

const { pendingActivities, activityTypes } = toRefs(props)

const edit = async (activity) => {
  const responseUser = await alertService.editElement(activity.id_activity, 'Actividad')
  if (responseUser.isConfirmed) {
    activityStore.setActivity(activity)
    router.push('/activityForm')
  }
}

const goToCustomer = async (id_customer) => {
  router.push({ name: 'CustomerDetail', params: { id: id_customer } })
}

const goToCustomerTrip = async (id_customer_trip) => {
  router.push({ name: 'CustomerTripDetail', params: { id: id_customer_trip } })
}

onMounted(() => {
  if (topScroll.value && mainScroll.value) {
    topScroll.value.addEventListener('scroll', syncScroll)
    mainScroll.value.addEventListener('scroll', syncScroll)
  }
})

const syncScroll = (e) => {
  if (e.target === topScroll.value) {
    mainScroll.value.scrollLeft = topScroll.value.scrollLeft
  } else if (e.target === mainScroll.value) {
    topScroll.value.scrollLeft = mainScroll.value.scrollLeft
  }
}
</script>

<template>
  <div class="kanban-board-wrapper">
    <div class="kanban-board-scroll" ref="topScroll">
      <div class="kanban-board"><p></p></div>
    </div>

    <div class="kanban-board-scroll" ref="mainScroll">
      <div class="kanban-board">
        <div v-for="column in activityTypes" :key="column.activity" class="kanban-column">
          <h3>{{ column.activity }}</h3>
          <h4>
            Clientes:
            {{
              pendingActivities.filter(
                (activity) => activity.activity_type.activity_order === column.activity_order
              ).length
            }}
          </h4>
          <div
            v-for="activity in pendingActivities.filter(
              (activity) => activity.activity_type.activity_order === column.activity_order
            )"
            :key="activity.id_activity"
            class="kanban-card"
          >
            <div @click="goToCustomer(activity.customer_trip.id_customer)" class="kanban-card-item">
              <h3>{{ activity.customer_trip.customer.company_name }}</h3>
            </div>
            <div @click="goToCustomerTrip(activity.id_customer_trip)" class="kanban-card-item">
              <p>
                {{ activity.customer_trip.collection.short_collection_name }} => ID Viaje:
                {{ activity.customer_trip.id_customer_trip }}
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
</style>
