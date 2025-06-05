<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'
import { useRouter } from 'vue-router'
import { useCustomerTripStore } from '@/stores/customerTripStore'

import CustomerTripTable from '@/components/customer/customerTrip/CustomerTripTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { customerTripService } from '@/services/customerTripService'

import { filterFormat } from '@/plugins/filterFormat'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const customerTrips = ref([])
const filteredCustomerTrips = ref([])
const router = useRouter()
const customerTripStore = useCustomerTripStore()

const addCustomersTrips = async () => {
  try {
    const response = await customerTripService.getCustomerTrips(skip, limit)
    customerTrips.value = response.data
    filteredCustomerTrips.value = response.data
  } catch (error) {
    alertService.generalError('Los viajes de los clientes no se pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addCustomersTrips()
  }
}

const customerFilterFields = [
  filterFormat.companyName,
  filterFormat.shortCollectionName,
  filterFormat.lineName,
  filterFormat.seller,
  filterFormat.budgetFrom,
  filterFormat.budgetUntil,
  filterFormat.budgetQuantitiesFrom,
  filterFormat.budgetQuantitiesUntil,
  filterFormat.closed
]

const filter = (filterValues, checkboxTouched) => {
  filteredCustomerTrips.value = customerTrips.value.filter(
    (customerTrip) =>
      (!filterValues.companyName ||
        customerTrip.customer.company_name
          .toLowerCase()
          .includes(filterValues.companyName.toLowerCase())) &&
      (!filterValues.shortCollectionName ||
        customerTrip.collection.short_collection_name
          .toLowerCase()
          .includes(filterValues.shortCollectionName.toLowerCase())) &&
      (!filterValues.lineName ||
        customerTrip.collection.line.line_name
          .toLowerCase()
          .includes(filterValues.lineName.toLowerCase())) &&
      (!filterValues.seller ||
        customerTrip.seller.last_name.toLowerCase().includes(filterValues.seller.toLowerCase()) ||
        customerTrip.seller.first_name.toLowerCase().includes(filterValues.seller.toLowerCase())) &&
      (!filterValues.budgetFrom || customerTrip.budget >= filterValues.budgetFrom) &&
      (!filterValues.budgetUntil || customerTrip.budget <= filterValues.budgetUntil) &&
      (!filterValues.budgetQuantitiesFrom ||
        customerTrip.budget_quantities >= filterValues.budgetQuantitiesFrom) &&
      (!filterValues.budgetQuantitiesUntil ||
        customerTrip.budget_quantities <= filterValues.budgetQuantitiesUntil) &&
      (!checkboxTouched.closed || customerTrip.closed === filterValues.closed)
  )
}

const create = () => {
  customerTripStore.clearCustomerTrip()
  router.push('/customerTripForm')
}

addDataUser()
</script>

<template>
  <div
    v-if="userStore.hasPermission('mediumHigh') | userStore.hasRole('Asesor Comercial')"
    class="button-create"
  >
    <button @click="create">Crear</button>
  </div>
  <main>
    <div>
      <h3>Viajes De Clientes</h3>
      <FilterForm :filterFields="customerFilterFields" @filter="filter" />
      <CustomerTripTable
        :customerTrips="filteredCustomerTrips"
        :additionalInfo="true"
      ></CustomerTripTable>
    </div>
  </main>
</template>
