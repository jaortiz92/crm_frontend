<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useInvoiceStore } from '@/stores/invoiceStore'

import InvoiceTable from '@/components/invoice/table/InvoiceTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { invoiceService } from '@/services/invoiceService'

import { filterFormat } from '@/plugins/filterFormat'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const invoices = ref([])
const filteredInvoices = ref([])
const router = useRouter()
const invoiceStore = useInvoiceStore()

const addInvoices = async () => {
  try {
    const response = await invoiceService.getInvoices(skip, limit)
    invoices.value = response.data
    filteredInvoices.value = [...invoices.value]
  } catch (error) {
    alertService.generalError('Las facturas no se pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addInvoices()
  }
}

const invoiceFilterFields = [
  filterFormat.companyName,
  filterFormat.noInvoice,
  filterFormat.idOrder,
  filterFormat.dateFrom,
  filterFormat.dateUntil,
  filterFormat.seller,
  filterFormat.shortCollectionName,
  filterFormat.lineName,
  filterFormat.city,
  filterFormat.paymentMethod
]

const filter = (filterValues) => {
  filteredInvoices.value = invoices.value.filter(
    (invoice) =>
      (!filterValues.companyName ||
        invoice.order.customer_trip.customer.company_name
          .toLowerCase()
          .includes(filterValues.companyName.toLowerCase())) &&
      (!filterValues.noInvoice ||
        invoice.invoice_number.toLowerCase().includes(filterValues.noInvoice.toLowerCase())) &&
      (!filterValues.idOrder || invoice.id_order === filterValues.idOrder) &&
      (!filterValues.dateFrom || invoice.invoice_date >= filterValues.dateFrom) &&
      (!filterValues.dateUntil || invoice.invoice_date <= filterValues.dateUntil) &&
      (!filterValues.seller ||
        invoice.order.seller.last_name.toLowerCase().includes(filterValues.seller.toLowerCase()) ||
        invoice.order.seller.first_name
          .toLowerCase()
          .includes(filterValues.seller.toLowerCase())) &&
      (!filterValues.shortCollectionName ||
        invoice.order.customer_trip.collection.short_collection_name
          .toLowerCase()
          .includes(filterValues.shortCollectionName.toLowerCase())) &&
      (!filterValues.lineName ||
        invoice.order.customer_trip.collection.line.line_name
          .toLowerCase()
          .includes(filterValues.lineName.toLowerCase())) &&
      (!filterValues.city ||
        invoice.order.customer_trip.customer.city.city_name
          .toLowerCase()
          .includes(filterValues.city.toLowerCase())) &&
      (!filterValues.paymentMethod ||
        invoice.order.payment_method.payment_method_name
          .toLowerCase()
          .includes(filterValues.paymentMethod.toLowerCase()))
  )
}

const create = () => {
  invoiceStore.clearInvoice()
  router.push('/invoiceForm')
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
      <h3>Facturas</h3>
      <FilterForm :filterFields="invoiceFilterFields" @filter="filter" />
      <InvoiceTable :invoices="filteredInvoices" :additionalInfo="true"></InvoiceTable>
    </div>
  </main>
</template>
