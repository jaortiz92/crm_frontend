<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { invoiceService } from '@/services/invoiceService'

import InvoiceDetailTable from '@/components/invoice/InvoiceDetailTable.vue'
import InvoiceInfo from '@/components/invoice/InvoiceInfo.vue'
import { useInvoiceStore } from '@/stores/invoiceStore'

const route = useRoute()
const invoiceDetails = ref([])
const invoice = ref(null)
const invoiceStore = useInvoiceStore()
const router = useRouter()

onMounted(async () => {
  const idInvoice = route.params.id
  invoice.value = (await invoiceService.getInvoiceWithDetails(idInvoice)).data
  if (invoice.value) {
    invoiceDetails.value = invoice.value.invoice_details
    delete invoice.value.invoice_details
  }
})

const edit = async () => {
  const responseUser = await alertService.editElement(invoice.value.id_invoice, 'Factura')
  if (responseUser.isConfirmed) {
    invoiceStore.setInvoice(invoice.value)
    router.push('/invoiceForm')
  }
}
</script>

<template>
  <div v-if="invoice">
    <div class="invoice">
      <div class="invoice-header">
        <InvoiceInfo :invoice="invoice"></InvoiceInfo>
      </div>
      <div class="invoice-detail">
        <InvoiceDetailTable :invoiceDetails="invoiceDetails"></InvoiceDetailTable>
      </div>
    </div>
    <div class="button-edit">
      <button @click="edit">Editar</button>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
    <p>{{ invoiceDetails }}</p>
  </div>
</template>

<style scoped>
.invoice-header {
  max-width: 1800px;
  min-width: 500px;
  margin: 10px;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: var(--border-radius-size);
  box-shadow: 0 2px 10px var(--shadow);
}
</style>
