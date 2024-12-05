<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'
import { useRouter } from 'vue-router'
import { useCustomerStore } from '@/stores/customerStore'

import CustomerTable from '@/components/customer/CustomerTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { customerService } from '@/services/customerService'

import { filterFormat } from '@/plugins/filterFormat'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const customers = ref([])
const filteredCustomers = ref([])
const router = useRouter()
const invoiceStore = useCustomerStore()

const addCustomers = async () => {
  try {
    const response = await customerService.getCustomers(skip, limit)
    customers.value = response.data
    filteredCustomers.value = [...customers.value]
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

const customerFilterFields = [filterFormat.companyName, filterFormat.document, filterFormat.active]

const filter = (filterValues, checkboxTouched) => {
  filteredCustomers.value = customers.value.filter(
    (customer) =>
      (!filterValues.companyName ||
        customer.company_name.toLowerCase().includes(filterValues.companyName.toLowerCase())) &&
      (!filterValues.document || customer.document === filterValues.document) &&
      (!checkboxTouched.active || customer.active === filterValues.active)
  )
}

const create = () => {
  invoiceStore.clearCustomer()
  router.push('/customerForm')
}

addDataUser()
</script>

<template>
  <div class="button-create">
    <button @click="create">Crear</button>
  </div>
  <main>
    <div>
      <h3>Clientes</h3>
      <FilterForm :filterFields="customerFilterFields" @filter="filter" />
      <CustomerTable :customers="filteredCustomers"></CustomerTable>
    </div>
  </main>
</template>
