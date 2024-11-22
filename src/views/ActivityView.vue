<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import ActivityTable from '@/components/activity/ActivityTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { activityService } from '@/services/activityService'

import { filterFormat } from '@/plugins/filterFormat'

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
  filterFormat.companyName,
  filterFormat.lineName,
  filterFormat.shortCollectionName,
  filterFormat.seller,
  filterFormat.responsibleUser,
  filterFormat.activity,
  filterFormat.city,
  filterFormat.creationDateFrom,
  filterFormat.creationDateUntil,
  filterFormat.estimatedDateFrom,
  filterFormat.estimatedDateUntil,
  filterFormat.completed
]

const filter = (filterValues, checkboxTouched) => {
  console.log(filterValues.creationDateFrom, typeof filterValues.estimatedDateFrom)
  filteredActivities.value = activities.value.filter(
    (activity) =>
      (!filterValues.companyName ||
        activity.customer_trip.customer.company_name
          .toLowerCase()
          .includes(filterValues.companyName.toLowerCase())) &&
      (!filterValues.lineName ||
        activity.customer_trip.collection.line.line_name
          .toLowerCase()
          .includes(filterValues.lineName.toLowerCase())) &&
      (!filterValues.seller ||
        activity.customer_trip.seller.last_name
          .toLowerCase()
          .includes(filterValues.seller.toLowerCase()) ||
        activity.customer_trip.seller.first_name
          .toLowerCase()
          .includes(filterValues.seller.toLowerCase())) &&
      (!filterValues.shortCollectionName ||
        activity.customer_trip.collection.short_collection_name
          .toLowerCase()
          .includes(filterValues.shortCollectionName.toLowerCase())) &&
      (!filterValues.responsibleUser ||
        activity.user_activities.last_name
          .toLowerCase()
          .includes(filterValues.responsibleUser.toLowerCase()) ||
        activity.user_activities.first_name
          .toLowerCase()
          .includes(filterValues.responsibleUser.toLowerCase())) &&
      (!filterValues.activity ||
        activity.activity_type.activity
          .toLowerCase()
          .includes(filterValues.activity.toLowerCase())) &&
      (!filterValues.city ||
        activity.customer_trip.customer.city.city_name.toLowerCase().includes(filterValues.city)) &&
      (!checkboxTouched.completed || activity.completed === filterValues.completed) &&
      (!filterValues.creationDateFrom || activity.creation_date >= filterValues.creationDateFrom) &&
      (!filterValues.creationDateUntil ||
        activity.creation_date <= filterValues.creationDateUntil) &&
      (!filterValues.estimatedDateFrom ||
        activity.estimated_date >= filterValues.estimatedDateFrom) &&
      (!filterValues.estimatedDateUntil ||
        activity.estimated_date <= filterValues.estimatedDateUntil)
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
