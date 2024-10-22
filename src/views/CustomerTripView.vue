<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import CustomerTripTable from '@/components/customer/customerTrip/CustomerTripTable.vue'

import { alertService } from '@/services/alertService'
import { customerTripService } from '@/services/customerTripService'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const customerTrips = ref([])

const addCustomersTrips = async () => {
  try {
    const response = await customerTripService.getCustomerTrips(skip, limit)
    customerTrips.value = response.data
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

addDataUser()
</script>

<template>
  <main>
    <div>
      <h3>Viajes De Clientes</h3>
      <CustomerTripTable :customerTrips="customerTrips" :additionalInfo="true"></CustomerTripTable>
    </div>
  </main>
</template>
