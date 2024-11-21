<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import CustomerTable from '@/components/customer/CustomerTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { customerService } from '@/services/customerService'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const customers = ref([])
const filteredCustomers = ref([])

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

const customerFilterFields = [
  {
    key: 'company_name',
    label: 'Compañia',
    type: 'text',
    placeholder: 'Filtrar por nombre compañia'
  },
  {
    key: 'document',
    label: 'Documento',
    type: 'number',
    placeholder: 'Filtrar por Documento'
  },
  {
    key: 'active',
    label: 'Activo',
    type: 'checkbox',
    placeholder: 'Filtrar por activo'
  }
]

const filter = (filterValues, checkboxTouched) => {
  console.log(checkboxTouched, '1')
  filteredCustomers.value = customers.value.filter(
    (customer) =>
      (!filterValues.company_name ||
        customer.company_name.toLowerCase().includes(filterValues.company_name.toLowerCase())) &&
      (!filterValues.document || customer.document === filterValues.document) &&
      (!checkboxTouched.active || customer.active === filterValues.active)
  )
}

addDataUser()
</script>

<template>
  <main>
    <div>
      <h3>Clientes</h3>
      <FilterForm :filterFields="customerFilterFields" @filter="filter" />
      <CustomerTable :customers="filteredCustomers"></CustomerTable>
    </div>
  </main>
</template>
