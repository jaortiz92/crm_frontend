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

const customerFilterFields = [
  filterFormat.companyName,
  filterFormat.document,
  filterFormat.is_consignation,
  filterFormat.active
]

const filter = (filterValues, checkboxTouched) => {
  filteredCustomers.value = customers.value.filter(
    (customer) =>
      (!filterValues.companyName ||
        customer.company_name.toLowerCase().includes(filterValues.companyName.toLowerCase())) &&
      (!filterValues.document || customer.document === filterValues.document) &&
      (!checkboxTouched.is_consignation ||
        customer.is_consignation === filterValues.is_consignation) &&
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
  <div class="list-page">
    <div class="page-header">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Clientes</h2>
      </div>
      <div
        v-if="userStore.hasPermission('mediumHigh') || userStore.hasRole('Asesor Comercial')"
        class="actions-bar"
      >
        <button class="btn btn-primary" @click="create">Crear</button>
      </div>
    </div>

    <FilterForm :filterFields="customerFilterFields" @filter="filter" />
    <CustomerTable :customers="filteredCustomers"></CustomerTable>
  </div>
</template>

<style scoped>
.list-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

@media (max-width: 768px) {
  .list-page {
    padding: 20px;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
