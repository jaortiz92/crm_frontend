<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import ActivityTable from '@/components/activity/ActivityTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { activityService } from '@/services/activityService'

const userStore = useUserStore()
const id_user = ref('')
const activities = ref([])
const filteredActivities = ref([])

const addActivities = async () => {
  try {
    const response = await activityService.getActivities(id_user.value)
    activities.value = response.data
    filteredActivities.value = [...activities.value]
  } catch (error) {
    alertService.generalError('Las actividades no se pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addActivities()
  }
}

const activityFilterFields = [
  {
    key: 'company_name',
    label: 'Compañia',
    type: 'text',
    placeholder: 'Filtrar por Nombre Compañia'
  },
  { key: 'line_name', label: 'Linea', type: 'text', placeholder: 'Filtrar por linea' },
  {
    key: 'short_collection_name',
    label: 'Colección',
    type: 'text',
    placeholder: 'Filtrar por Colección'
  },
  { key: 'seller', label: 'Vendedor', type: 'text', placeholder: 'Filtrar por Vendedor' },
  {
    key: 'user_activities',
    label: 'Responsable',
    type: 'text',
    placeholder: 'Filtrar por Responsable'
  },
  {
    key: 'activity',
    label: 'Actividad',
    type: 'text',
    placeholder: 'Filtrar por Actividad'
  },
  {
    key: 'city_name',
    label: 'Ciudad',
    type: 'text',
    placeholder: 'Filtrar por Ciudad'
  },
  {
    key: 'creation_date_more',
    label: 'Desde fecha de creación',
    type: 'date',
    placeholder: 'Filtrar por fecha de creación'
  },
  {
    key: 'creation_date_less',
    label: 'Hasta fecha de creación',
    type: 'date',
    placeholder: 'Filtrar por fecha de creación'
  },
  {
    key: 'estimated_date_more',
    label: 'Desde fecha para ejecución',
    type: 'date',
    placeholder: 'Filtrar por fecha para ejecución'
  },
  {
    key: 'estimated_date_less',
    label: 'Hasta fecha para ejecución',
    type: 'date',
    placeholder: 'Filtrar por fecha para ejecución'
  },
  {
    key: 'completed',
    label: 'Completado',
    type: 'checkbox',
    placeholder: 'Filtrar por Estado'
  }
]

const filter = (filterValues, checkboxTouched) => {
  filteredActivities.value = activities.value.filter(
    (activity) =>
      (!filterValues.company_name ||
        activity.customer_trip.customer.company_name
          .toLowerCase()
          .includes(filterValues.company_name.toLowerCase())) &&
      (!filterValues.line_name ||
        activity.customer_trip.collection.line.line_name
          .toLowerCase()
          .includes(filterValues.line_name.toLowerCase())) &&
      (!filterValues.seller ||
        activity.customer_trip.seller.last_name
          .toLowerCase()
          .includes(filterValues.seller.toLowerCase()) ||
        activity.customer_trip.seller.first_name
          .toLowerCase()
          .includes(filterValues.seller.toLowerCase())) &&
      (!filterValues.short_collection_name ||
        activity.customer_trip.collection.short_collection_name
          .toLowerCase()
          .includes(filterValues.short_collection_name.toLowerCase())) &&
      (!filterValues.user_activities ||
        activity.user_activities.last_name
          .toLowerCase()
          .includes(filterValues.user_activities.toLowerCase()) ||
        activity.user_activities.first_name
          .toLowerCase()
          .includes(filterValues.user_activities.toLowerCase())) &&
      (!filterValues.activity ||
        activity.activity_type.activity
          .toLowerCase()
          .includes(filterValues.activity.toLowerCase())) &&
      (!filterValues.city_name ||
        activity.customer_trip.customer.city.city_name
          .toLowerCase()
          .includes(filterValues.city_name)) &&
      (!checkboxTouched.completed || activity.completed === filterValues.completed) &&
      (!filterValues.creation_date_more ||
        activity.creation_date > filterValues.creation_date_more) &&
      (!filterValues.creation_date_less ||
        activity.creation_date < filterValues.creation_date_less) &&
      (!filterValues.estimated_date_more ||
        activity.estimated_date > filterValues.estimated_date_more) &&
      (!filterValues.estimated_date_less ||
        activity.estimated_date < filterValues.estimated_date_less)
  )
}

addDataUser()
</script>

<template>
  <main>
    <div>
      <h3>Actividades</h3>
      <FilterForm :filterFields="activityFilterFields" @filter="filter" />
      <ActivityTable
        :activities="filteredActivities"
        :additionalInfo="true"
        :itemsScale="10"
      ></ActivityTable>
    </div>
  </main>
</template>
