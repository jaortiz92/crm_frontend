<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { invoiceService } from '@/services/invoiceService'

import InvoiceDetailTable from '@/components/invoice/table/InvoiceDetailTable.vue'
import InvoiceInfo from '@/components/invoice/InvoiceInfo.vue'
import { useInvoiceStore } from '@/stores/invoiceStore'
import InvoiceDetailByBrandTable from '@/components/invoice/table/InvoiceDetailByBrandTable.vue'
import InvoiceDetailBySizeTable from '@/components/invoice/table/InvoiceDetailBySizeTable.vue'
import InvoiceDetailByDescriptionTable from '@/components/invoice/table/InvoiceDetailByDescriptionTable.vue'

const route = useRoute()
const invoiceDetails = ref([])
const invoiceDetailsByBrand = ref([])
const invoiceDetailsByDescription = ref([])
const invoiceDetailsBySize = ref([])
const invoice = ref(null)
const invoiceStore = useInvoiceStore()
const router = useRouter()

onMounted(async () => {
  const idInvoice = route.params.id
  invoice.value = (await invoiceService.getInvoiceWithDetails(idInvoice)).data
  if (invoice.value) {
    invoiceDetails.value = invoice.value.invoice_details
    delete invoice.value.invoice_details
    invoiceDetailsByBrand.value = (
      await invoiceService.getInvoiceDetailsByBrandAndIdInvoice(idInvoice)
    ).data
    invoiceDetailsByDescription.value = (
      await invoiceService.getInvoiceDetailsByDescriptionAndIdInvoice(idInvoice)
    ).data
    invoiceDetailsBySize.value = (
      await invoiceService.getInvoiceDetailsBySizeAndIdInvoice(idInvoice)
    ).data
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
        <h2>Resumen Detalle Factura</h2>
        <div class="tables-datail-summary">
          <InvoiceDetailByBrandTable
            :invoiceDetailsByBrand="invoiceDetailsByBrand"
          ></InvoiceDetailByBrandTable>
          <div class="small-tables">
            <InvoiceDetailBySizeTable
              :invoiceDetailsBySize="invoiceDetailsBySize"
            ></InvoiceDetailBySizeTable>
            <InvoiceDetailByDescriptionTable
              :invoiceDetailsByDescription="invoiceDetailsByDescription"
            ></InvoiceDetailByDescriptionTable>
          </div>
        </div>
        <h2>Detalle Factura</h2>
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

.tables-datail-summary {
  padding: 20px;
}

.small-tables {
  display: flex;
  justify-content: center;
}

.tables-datail-summary div {
  padding: 10px;
}
</style>
