<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import CustomerTripTable from '@/components/customer/customerTrip/CustomerTripTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { customerTripService } from '@/services/customerTripService'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const customerTrips = ref([])
const filteredCustomerTrips = ref([])

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
  {
    key: 'company_name',
    label: 'Compañia',
    type: 'text',
    placeholder: 'Filtrar por nombre compañia'
  },
  {
    key: 'short_collection_name',
    label: 'Collección',
    type: 'text',
    placeholder: 'Filtrar por Collección'
  },
  {
    key: 'ordered',
    label: 'Ordenó',
    type: 'checkbox',
    placeholder: 'Filtrar si ordenó'
  }
]

const filter = (filterValues, checkboxTouched) => {
  filteredCustomerTrips.value = customerTrips.value.filter(
    (customerTrip) =>
      (!filterValues.company_name ||
        customerTrip.customer.company_name
          .toLowerCase()
          .includes(filterValues.company_name.toLowerCase())) &&
      (!filterValues.short_collection_name ||
        customerTrip.collection.short_collection_name
          .toLowerCase()
          .includes(filterValues.short_collection_name)) &&
      (!checkboxTouched.ordered || customerTrip.ordered === filterValues.ordered)
  )
}

addDataUser()
</script>

<template>
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
