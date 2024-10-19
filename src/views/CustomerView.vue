<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import CustomerTable from '@/components/customer/CustomerTable.vue'

import { alertService } from '@/services/alertService'
import { customerService } from '@/services/customerService'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const customers = ref([])

const addCustomers = async () => {
  try {
    const response = await customerService.getCustomers(skip, limit)
    customers.value = response.data
  } catch (error) {
    alertService.generalError('Los clientes no se pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addCustomers()
  }
}

addDataUser()
</script>

<template>
  <main>
    <div>
      <h3>Clientes</h3>
      <CustomerTable :customers="customers"></CustomerTable>
    </div>
  </main>
</template>
