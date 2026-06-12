<script setup>
import { defineProps, toRefs, ref, watch } from 'vue'
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

// State and filters
const categoryActivityTypeFilter = ref('Todas')
const categoryActivityCollectionFilter = ref('Todas')
const categoryActivityLineFilter = ref('Todas')
const searchFilter = ref('')
const collapsedColumns = ref({})
const hasAutoCollapsed = ref(false)

const activityTypesFiltered = ref([])
const categoryActivityTypes = ref([])
const pendingActivitiesFiltered = ref([])
const categoryActivityCollections = ref([])
const categoryActivityLines = ref([])
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

const toggleColumn = (id) => {
  collapsedColumns.value[id] = !collapsedColumns.value[id]
}

const getColumnActivitiesCount = (column) => {
  return pendingActivitiesFiltered.value.filter(
    (activity) => activity.activity_type.activity_order === column.activity_order
  ).length
}

const autoCollapseEmptyColumns = () => {
  if (hasAutoCollapsed.value || !activityTypes.value.length || !pendingActivities.value.length)
    return

  activityTypes.value.forEach((column) => {
    const count = pendingActivities.value.filter(
      (activity) => activity.activity_type.activity_order === column.activity_order
    ).length
    if (count === 0) {
      collapsedColumns.value[column.id_activity_type] = true
    }
  })

  hasAutoCollapsed.value = true
}

const isOverdue = (estimatedDate) => {
  if (!estimatedDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Parse YYYY-MM-DD safely
  const parts = estimatedDate.split('-')
  if (parts.length !== 3) return false
  const estDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  return estDate < today
}

const updateKambaCategory = () => {
  if (categoryActivityTypeFilter.value === 'Todas') {
    activityTypesFiltered.value = activityTypes.value
  } else {
    activityTypesFiltered.value = activityTypes.value.filter(
      (item) => item.category === categoryActivityTypeFilter.value
    )
  }

  let result = pendingActivities.value

  if (categoryActivityCollectionFilter.value !== 'Todas') {
    result = result.filter(
      (item) =>
        item.customer_trip.collection.short_collection_name ===
        categoryActivityCollectionFilter.value
    )
  }

  if (categoryActivityLineFilter.value !== 'Todas') {
    result = result.filter(
      (item) => item.customer_trip.collection.line.line_name === categoryActivityLineFilter.value
    )
  }

  if (searchFilter.value.trim() !== '') {
    const query = searchFilter.value.toLowerCase().trim()
    result = result.filter((item) => {
      const company = (item.customer_trip?.customer?.company_name || '').toLowerCase()
      const tripId = String(item.customer_trip?.id_customer_trip || '').toLowerCase()
      const collection = (item.customer_trip?.collection?.short_collection_name || '').toLowerCase()
      const userFirst = (item.user_activities?.first_name || '').toLowerCase()
      const userLast = (item.user_activities?.last_name || '').toLowerCase()
      const fullName = `${userFirst} ${userLast}`

      return (
        company.includes(query) ||
        tripId.includes(query) ||
        collection.includes(query) ||
        fullName.includes(query)
      )
    })
  }

  pendingActivitiesFiltered.value = result
}

const saveUpdate = async (activity) => {
  await activityService.updateActivity(activity.id_activity, activity)
  alertService.generalSucces(
    `La Actividad con ID ${activity.id_activity}, fue actualizada exitosamente`
  )
}

const handleDragStart = (activity) => {
  draggedActivity.value = activity
}

const handleDrop = async (targetType, event) => {
  event.preventDefault()
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
      await saveUpdate(draggedActivity.value)
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

// Watchers
watch(searchFilter, () => {
  updateKambaCategory()
})

watch(
  activityTypes,
  () => {
    categoryActivityTypes.value = [
      ...new Set(activityTypes.value.map((item) => item.category))
    ].sort()
    updateKambaCategory()
  },
  {
    immediate: true
  }
)

watch(
  pendingActivities,
  () => {
    categoryActivityCollections.value = [
      ...new Set(
        pendingActivities.value.map((item) => item.customer_trip.collection.short_collection_name)
      )
    ].sort()
    updateKambaCategory()
  },
  {
    immediate: true
  }
)

watch(
  pendingActivities,
  () => {
    categoryActivityLines.value = [
      ...new Set(
        pendingActivities.value.map((item) => item.customer_trip.collection.line.line_name)
      )
    ].sort()
    updateKambaCategory()
  },
  {
    immediate: true
  }
)

watch(
  [pendingActivities, activityTypes],
  () => {
    if (pendingActivities.value.length > 0 && activityTypes.value.length > 0) {
      autoCollapseEmptyColumns()
    }
  },
  {
    immediate: true
  }
)
</script>

<template>
  <div class="kanban-wrapper">
    <!-- Header with title & filters -->
    <div class="kanban-header-bar">
      <div class="kanban-title-section">
        <h2>Tablero de Actividades</h2>
        <p class="subtitle">Gestiona y arrastra las tareas pendientes de tus clientes</p>
      </div>
      <div class="kanban-controls">
        <div class="search-input-wrapper">
          <label>Buscar</label>
          <div class="search-field-container">
            <svg
              class="search-icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              v-model="searchFilter"
              placeholder="Buscar por cliente, responsable o viaje..."
              class="search-input"
            />
            <button
              v-if="searchFilter"
              @click="searchFilter = ''"
              class="clear-search-btn"
              title="Limpiar búsqueda"
            >
              &times;
            </button>
          </div>
        </div>
        <div class="filters-row">
          <div class="field-input-wrapper">
            <label>Categoría</label>
            <select
              v-model="categoryActivityTypeFilter"
              @change="updateKambaCategory"
              class="modern-select"
            >
              <option>Todas</option>
              <option v-for="option in categoryActivityTypes" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </div>
          <div class="field-input-wrapper">
            <label>Temporada</label>
            <select
              v-model="categoryActivityCollectionFilter"
              @change="updateKambaCategory"
              class="modern-select"
            >
              <option>Todas</option>
              <option v-for="option in categoryActivityCollections" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </div>
          <div class="field-input-wrapper">
            <label>Línea</label>
            <select
              v-model="categoryActivityLineFilter"
              @change="updateKambaCategory"
              class="modern-select"
            >
              <option>Todas</option>
              <option v-for="option in categoryActivityLines" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Kanban Board -->
    <div class="kanban-board-wrapper">
      <div class="kanban-board-scroll">
        <div class="kanban-board">
          <div
            v-for="(column, index) in activityTypesFiltered"
            :key="column.id_activity_type"
            class="kanban-column"
            :class="{ 'column-collapsed': collapsedColumns[column.id_activity_type] }"
            @dragover="allowDrop"
            @drop="(event) => handleDrop(column, event)"
          >
            <!-- Column Header (Shown only when NOT collapsed) -->
            <div
              v-show="!collapsedColumns[column.id_activity_type]"
              class="kanban-column-header"
              @click="toggleColumn(column.id_activity_type)"
            >
              <div class="column-header-main">
                <span class="column-collapse-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    class="icon-chevron"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </span>
                <h3 class="column-title" :title="column.activity">
                  {{ index + 1 }}. {{ column.activity }}
                </h3>
              </div>

              <div class="column-header-meta">
                <span class="category-tag">{{ column.category }}</span>
                <span class="client-count-badge">
                  {{ getColumnActivitiesCount(column) }}
                </span>
              </div>
            </div>

            <!-- Kanban Cards Container (Shown only when NOT collapsed) -->
            <div class="kanban-cards-container" v-show="!collapsedColumns[column.id_activity_type]">
              <div
                v-for="activity in pendingActivitiesFiltered.filter(
                  (activity) => activity.activity_type.activity_order === column.activity_order
                )"
                :key="activity.id_activity"
                class="kanban-card"
                :class="{ 'card-overdue': isOverdue(activity.estimated_date) }"
                draggable="true"
                @dragstart="handleDragStart(activity)"
              >
                <!-- Drag Handle & Card actions -->
                <div class="kanban-card-top">
                  <div class="drag-handle" title="Arrastra esta actividad">
                    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
                      <circle cx="2" cy="2" r="1.5" />
                      <circle cx="2" cy="8" r="1.5" />
                      <circle cx="2" cy="14" r="1.5" />
                      <circle cx="10" cy="2" r="1.5" />
                      <circle cx="10" cy="8" r="1.5" />
                      <circle cx="10" cy="14" r="1.5" />
                    </svg>
                  </div>
                  <span class="activity-id">#{{ activity.id_activity }}</span>
                </div>

                <!-- Company Details -->
                <div
                  @click="goToCustomer(activity.customer_trip.id_customer)"
                  class="card-section company-section"
                  title="Ver detalle del cliente"
                >
                  <svg
                    class="icon-svg"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  <h4 class="company-name">{{ activity.customer_trip.customer.company_name }}</h4>
                </div>

                <!-- Trip Details -->
                <div
                  @click="goToCustomerTrip(activity.id_customer_trip)"
                  class="card-section trip-section"
                  title="Ver detalle del viaje"
                >
                  <svg
                    class="icon-svg"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                  <span class="trip-badge">
                    {{ activity.customer_trip.collection.short_collection_name }} &middot; ID
                    {{ activity.customer_trip.id_customer_trip }}
                  </span>
                </div>

                <!-- Footer with Info -->
                <div
                  @click="edit(activity)"
                  class="card-section info-section"
                  title="Editar actividad"
                >
                  <div
                    class="info-row date-row"
                    :class="{ 'date-overdue': isOverdue(activity.estimated_date) }"
                  >
                    <svg
                      class="icon-svg"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span>
                      Est: <strong>{{ activity.estimated_date }}</strong>
                      <span v-if="isOverdue(activity.estimated_date)" class="overdue-tag"
                        >Vencida</span
                      >
                    </span>
                  </div>
                  <div class="info-row user-row">
                    <svg
                      class="icon-svg"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <span class="user-name">
                      {{ activity.user_activities.first_name }}
                      {{ activity.user_activities.last_name }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Collapsed view minimal placeholder (Shown only when collapsed) -->
            <div
              v-show="collapsedColumns[column.id_activity_type]"
              class="collapsed-column-indicator"
              @click="toggleColumn(column.id_activity_type)"
              title="Haz clic para expandir la columna"
            >
              <div
                class="collapsed-badge"
                :class="{ 'badge-zero': getColumnActivitiesCount(column) === 0 }"
              >
                {{ getColumnActivitiesCount(column) }}
              </div>
              <span class="vertical-text"> {{ index + 1 }}. {{ column.activity }} </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban-wrapper {
  background-color: #ffffff;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.05);
  margin-bottom: 2rem;
  font-family: Helvetica, Arial, sans-serif;
}

/* Header Section */
.kanban-header-bar {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

@media (min-width: 992px) {
  .kanban-header-bar {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-end;
  }
}

.kanban-title-section {
  text-align: left;
}

.kanban-title-section h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--dark-color);
  margin: 0 0 0.25rem 0;
  text-align: left;
}

.kanban-title-section .subtitle {
  font-size: 0.85rem;
  color: #666;
  margin: 0;
}

.kanban-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

@media (min-width: 768px) {
  .kanban-controls {
    flex-direction: row;
    align-items: flex-end;
    width: auto;
  }
}

/* Search bar styling */
.search-input-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex-grow: 1;
  min-width: 260px;
}

.search-input-wrapper label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-gray);
  margin-bottom: 0.25rem;
  padding-left: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.search-field-container {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  width: 18px;
  height: 18px;
  color: #888888;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 38px;
  font-size: 0.9rem;
  border: 1.5px solid var(--light-border);
  border-radius: 8px;
  background-color: #fafafa;
  color: var(--text-black);
  outline: none;
  transition: all 0.2s ease;
  margin: 0;
  max-width: none;
  height: 38px;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: var(--normal-color);
  background-color: #ffffff;
  box-shadow: 0 0 0 3px rgba(20, 161, 217, 0.15);
}

.clear-search-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #888888;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 2px 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s;
  z-index: 5;
}

.clear-search-btn:hover {
  background-color: #e5e5e5;
  color: #333;
}

/* Filters row */
.filters-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}

.field-input-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.field-input-wrapper label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-gray);
  margin-bottom: 0.25rem;
  padding-left: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.modern-select {
  padding: 8px 12px;
  font-size: 0.85rem;
  border: 1.5px solid var(--light-border);
  border-radius: 8px;
  background-color: #ffffff;
  color: var(--text-black);
  outline: none;
  cursor: pointer;
  transition: all 0.2s ease;
  margin: 0;
  width: 140px;
  max-width: 160px;
  height: 38px;
  box-sizing: border-box;
}

.modern-select:focus {
  border-color: var(--normal-color);
  box-shadow: 0 0 0 3px rgba(20, 161, 217, 0.15);
}

/* Board container */
.kanban-board-wrapper {
  display: flex;
  flex-direction: column;
}

.kanban-board-scroll {
  overflow-x: auto;
  padding-bottom: 1rem;
}

/* Customized scrollbar for board */
.kanban-board-scroll::-webkit-scrollbar {
  height: 8px;
}

.kanban-board-scroll::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

.kanban-board-scroll::-webkit-scrollbar-thumb {
  background: var(--background-light);
  border-radius: 10px;
}

.kanban-board-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--normal-color);
}

.kanban-board {
  display: flex;
  gap: 1rem;
  width: max-content;
  align-items: stretch;
}

/* Columns styling */
.kanban-column {
  width: 250px;
  min-width: 250px;
  background-color: #f3f6f8;
  border-radius: 10px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border: 1px solid rgba(0, 0, 0, 0.04);
  min-height: 620px;
}

.kanban-column.column-collapsed {
  width: 50px;
  min-width: 50px;
  padding: 0.75rem 0.25rem;
  cursor: pointer;
  background-color: #e9ecef;
}

/* Header style with top line indicator */
.kanban-column-header {
  border-top: 3px solid var(--normal-color);
  background-color: #ffffff;
  border-radius: 6px;
  margin-bottom: 0.75rem;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.kanban-column-header:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.06);
  border-top-color: var(--dark-color);
}

.column-header-main {
  display: flex;
  align-items: center;
  gap: 4px;
}

.column-collapse-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #777;
}

.icon-chevron {
  width: 16px;
  height: 16px;
}

.column-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-gray);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
  text-align: left;
}

.column-header-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}

.category-tag {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--dark-color-opposite-one);
  background-color: var(--light-color-opposite-one);
  padding: 2px 6px;
  border-radius: 4px;
}

.client-count-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: #ffffff;
  background-color: var(--dark-color);
  padding: 2px 8px;
  border-radius: 12px;
}

/* Collapsed column indicator */
.collapsed-column-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  height: 100%;
  padding-top: 1rem;
  gap: 1.5rem;
  cursor: pointer;
  user-select: none;
}

.collapsed-badge {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background-color: var(--dark-color);
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
}

.collapsed-badge.badge-zero {
  background-color: #c2cfd6;
  color: #555;
  box-shadow: none;
}

.vertical-text {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--text-gray);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: 480px;
  text-transform: uppercase;
  transition: color 0.2s ease;
}

.collapsed-column-indicator:hover .vertical-text {
  color: var(--normal-color);
}

.collapsed-column-indicator:hover .collapsed-badge {
  transform: scale(1.1);
  background-color: var(--normal-color);
  color: #ffffff;
}

/* Kanban Cards Container */
.kanban-cards-container {
  height: 550px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Custom scrollbar for cards container */
.kanban-cards-container::-webkit-scrollbar {
  width: 4px;
}

.kanban-cards-container::-webkit-scrollbar-track {
  background: transparent;
}

.kanban-cards-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.kanban-cards-container::-webkit-scrollbar-thumb:hover {
  background: var(--normal-color);
}

/* Premium Card Design */
.kanban-card {
  background-color: #ffffff;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.03);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: grab;
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  text-align: left;
}

.kanban-card:active {
  cursor: grabbing;
}

/* Premium Elevate on Hover */
.kanban-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
  border-color: var(--light-color-opposite-two);
}

/* Overdue card state */
.kanban-card.card-overdue {
  border-left: 4px solid var(--red-color);
}

/* Card Top bar with handle */
.kanban-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px dashed #f0f0f0;
  padding-bottom: 4px;
}

.drag-handle {
  color: #c1c1c1;
  display: flex;
  align-items: center;
}

.kanban-card:hover .drag-handle {
  color: #888888;
}

.activity-id {
  font-size: 0.65rem;
  font-weight: 700;
  color: #999;
}

/* Card Sections */
.card-section {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.card-section:hover {
  background-color: #f7f9fa;
}

.icon-svg {
  width: 14px;
  height: 14px;
  color: #666;
  flex-shrink: 0;
  margin-top: 2px;
}

/* Company Section */
.company-section {
  cursor: pointer;
}

.company-section:hover {
  background-color: var(--light-color-opposite-one);
}

.company-section:hover .icon-svg {
  color: var(--dark-color-opposite-one);
}

.company-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-black);
  margin: 0;
  line-height: 1.2;
  word-break: break-word;
  white-space: normal;
}

.company-section:hover .company-name {
  color: var(--dark-color-opposite-one);
}

/* Trip Section */
.trip-section {
  cursor: pointer;
}

.trip-section:hover {
  background-color: rgba(115, 133, 232, 0.1);
}

.trip-section:hover .icon-svg {
  color: var(--dark-color-opposite-two);
}

.trip-badge {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--dark-color-opposite-two);
  background-color: #ebedfa;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1.2;
}

.trip-section:hover .trip-badge {
  background-color: #dbe0fa;
}

/* Info Section (Dates & Responsable) */
.info-section {
  border-top: 1px solid #f6f6f6;
  padding-top: 6px;
  margin-top: 2px;
  cursor: pointer;
  flex-direction: column;
  gap: 4px;
}

.info-section:hover {
  background-color: #fafafa;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: #555555;
  width: 100%;
}

.info-row strong {
  color: #333333;
}

.date-overdue {
  color: var(--red-color);
}

.date-overdue strong {
  color: var(--red-color);
}

.date-overdue .icon-svg {
  color: var(--red-color);
}

.overdue-tag {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  background-color: rgba(194, 26, 26, 0.1);
  color: var(--red-color);
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 4px;
  border: 0.5px solid rgba(194, 26, 26, 0.2);
}

.user-name {
  font-weight: 600;
  color: #444;
}
</style>
