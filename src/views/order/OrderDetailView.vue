<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { orderService } from '@/services/orderService'
import { invoiceService } from '@/services/invoiceService'
import { advanceService } from '@/services/advanceService'

import OrderDetailTable from '@/components/order/table/OrderDetailTable.vue'
import OrderInfo from '@/components/order/OrderInfo.vue'
import InvoiceTable from '@/components/invoice/table/InvoiceTable.vue'
import AdvanceTable from '@/components/advance/AdvanceTable.vue'
import { useUserStore } from '@/stores/userStore.js'
import { useOrderStore } from '@/stores/orderStore'
import { useInvoiceStore } from '@/stores/invoiceStore'
import OrderDetailByBrandTable from '@/components/order/table/OrderDetailByBrandTable.vue'
import OrderDetailByDescriptionTable from '@/components/order/table/OrderDetailByDescriptionTable.vue'
import OrderDetailBySizeTable from '@/components/order/table/OrderDetailBySizeTable.vue'

const route = useRoute()
const orderDetails = ref([])
const orderDetailsByBrand = ref([])
const orderDetailsByDescription = ref([])
const orderDetailsBySize = ref([])
const order = ref(null)
const invoices = ref([])
const advances = ref([])
const userStore = useUserStore()
const orderStore = useOrderStore()
const invoiceStore = useInvoiceStore()
const router = useRouter()

onMounted(async () => {
  const idOrder = route.params.id
  order.value = (await orderService.getOrderWithDetails(idOrder)).data
  if (order.value) {
    orderDetails.value = order.value.order_details
    delete order.value.order_details
    orderDetailsByBrand.value = (await orderService.getOrderDetailsByBrandAndIdOrder(idOrder)).data
    orderDetailsByDescription.value = (
      await orderService.getOrderDetailsByDescriptionAndIdOrder(idOrder)
    ).data
    orderDetailsBySize.value = (await orderService.getOrderDetailsBySizeAndIdOrder(idOrder)).data
  }
  invoices.value = (await invoiceService.getInvoiceByOrder(idOrder)).data
  advances.value = (await advanceService.getAdvanceByIdOrder(idOrder)).data
})

const edit = async () => {
  const responseUser = await alertService.editElement(order.value.id_order, 'Orden')
  if (responseUser.isConfirmed) {
    orderStore.setOrder(order.value)
    router.push('/orderForm')
  }
}

const createAdvance = async () => {
  const responseUser = await alertService.createElement('Anticipo')
  if (responseUser.isConfirmed) {
    orderStore.setOrder(order.value)
    router.push(`/advanceForm/${orderDetails.value.id_order}`)
  }
}

const createInvoice = async () => {
  const responseUser = await alertService.createElement('Factura')
  if (responseUser.isConfirmed) {
    invoiceStore.clearInvoice()
    orderStore.setOrder(order.value)
    router.push('/invoiceForm')
  }
}
</script>

<template>
  <div v-if="order" class="order-page">
    <div class="order-card-wrapper">
      <OrderInfo :order="order"></OrderInfo>
    </div>

    <div class="actions-bar">
      <button
        v-if="userStore.hasPermission('medium') || userStore.hasRole('Asesor Comercial')"
        class="btn btn-primary"
        @click="createAdvance"
      >
        Crear Anticipo
      </button>
      <button
        v-if="userStore.hasPermission('mediumHigh') || userStore.hasRole('Asesor Comercial')"
        class="btn btn-primary"
        @click="createInvoice"
      >
        Crear Factura
      </button>
      <button
        v-if="userStore.hasPermission('mediumHigh') || userStore.hasRole('Asesor Comercial')"
        class="btn btn-primary"
        @click="edit"
      >
        Editar Orden
      </button>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Anticipos</h2>
      </div>
      <div class="table-wrapper">
        <AdvanceTable :advances="advances"></AdvanceTable>
      </div>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Facturas</h2>
      </div>
      <div class="table-wrapper">
        <InvoiceTable :invoices="invoices"></InvoiceTable>
      </div>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Resumen Detalle Orden</h2>
      </div>
      <div class="table-wrapper">
        <OrderDetailByBrandTable
          :orderDetailsByBrand="orderDetailsByBrand"
        ></OrderDetailByBrandTable>
      </div>
      <div class="small-tables-row">
        <div class="table-wrapper">
          <OrderDetailBySizeTable :orderDetailsBySize="orderDetailsBySize"></OrderDetailBySizeTable>
        </div>
        <div class="table-wrapper">
          <OrderDetailByDescriptionTable
            :orderDetailsByDescription="orderDetailsByDescription"
          ></OrderDetailByDescriptionTable>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Detalle Orden</h2>
      </div>
      <div class="table-wrapper">
        <OrderDetailTable :orderDetails="orderDetails"></OrderDetailTable>
      </div>
    </div>
  </div>

  <div v-else class="loading">
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.order-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.order-card-wrapper {
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
  .order-page {
    padding: 20px;
  }
}
</style>
