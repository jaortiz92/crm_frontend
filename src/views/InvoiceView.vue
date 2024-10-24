<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import InvoiceTable from '@/components/invoice/InvoiceTable.vue'

import { alertService } from '@/services/alertService'
import { invoiceService } from '@/services/invoiceService'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const invoices = ref([])

const addInvoices = async () => {
  try {
    const response = await invoiceService.getInvoices(skip, limit)
    invoices.value = response.data
  } catch (error) {
    alertService.generalError('Las ordenes pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addInvoices()
  }
}

addDataUser()
</script>

<template>
  <main>
    <div>
      <h3>Facturas</h3>
      <InvoiceTable :invoices="invoices" :additionalInfo="true"></InvoiceTable>
    </div>
  </main>
</template>
