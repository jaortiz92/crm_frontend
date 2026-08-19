<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { invoiceService } from '@/services/invoiceService'

import InvoiceDetailTable from '@/components/invoice/table/InvoiceDetailTable.vue'
import InvoiceInfo from '@/components/invoice/InvoiceInfo.vue'
import { useUserStore } from '@/stores/userStore.js'
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
const userStore = useUserStore()

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
  <div v-if="invoice" class="invoice-page">
    <div class="invoice-card-wrapper">
      <InvoiceInfo :invoice="invoice"></InvoiceInfo>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Resumen Detalle Factura</h2>
      </div>
      <div class="table-wrapper">
        <InvoiceDetailByBrandTable
          :invoiceDetailsByBrand="invoiceDetailsByBrand"
        ></InvoiceDetailByBrandTable>
      </div>
      <div class="small-tables-row">
        <div class="table-wrapper">
          <InvoiceDetailBySizeTable
            :invoiceDetailsBySize="invoiceDetailsBySize"
          ></InvoiceDetailBySizeTable>
        </div>
        <div class="table-wrapper">
          <InvoiceDetailByDescriptionTable
            :invoiceDetailsByDescription="invoiceDetailsByDescription"
          ></InvoiceDetailByDescriptionTable>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Detalle Factura</h2>
      </div>
      <div class="table-wrapper">
        <InvoiceDetailTable :invoiceDetails="invoiceDetails"></InvoiceDetailTable>
      </div>
    </div>

    <div
      v-if="userStore.hasPermission('medium') || userStore.hasRole('Asesor Comercial')"
      class="actions-bar"
    >
      <button class="btn btn-primary" @click="edit">Editar Factura</button>
    </div>
  </div>

  <div v-else class="loading">
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.invoice-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.invoice-card-wrapper {
  width: 100%;
  margin-bottom: 24px;
}

.detail-section {
  margin-bottom: 32px;
}

.table-wrapper {
  overflow-x: auto;
  width: 100%;
  margin-bottom: 12px;
}

.small-tables-row {
  display: flex;
  gap: 24px;
}

.small-tables-row .table-wrapper {
  flex: 1;
  min-width: 0;
}

.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0;
}

.loading {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary, #616161);
}

@media (max-width: 1024px) {
  .small-tables-row {
    flex-direction: column;
    gap: 16px;
  }
}

@media (max-width: 768px) {
  .invoice-page {
    padding: 20px;
  }
}
</style>
