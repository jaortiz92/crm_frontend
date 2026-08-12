<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { customerTripService } from '@/services/customerTripService'
import { activityService } from '@/services/activityService'
import { orderService } from '@/services/orderService'
import { invoiceService } from '@/services/invoiceService'

import CustomerTripInfo from '@/components/customer/customerTrip/CustomerTripInfo.vue'
import ActivityTable from '@/components/activity/ActivityTable.vue'
import ActivityComments from '@/components/activity/ActivityComments.vue'
import CustomerTripSummaryTable from '@/components/customer/customerTrip/CustomerTripSummaryTable.vue'
import OrderTable from '@/components/order/table/OrderTable.vue'
import InvoiceTable from '@/components/invoice/table/InvoiceTable.vue'
import { useUserStore } from '@/stores/userStore.js'
import { useCustomerTripStore } from '@/stores/customerTripStore'
import { useOrderStore } from '@/stores/orderStore'

const route = useRoute()
const customerTrip = ref(null)
const activities = ref([])
const orders = ref([])
const invoices = ref([])
const userStore = useUserStore()
const customerTripStore = useCustomerTripStore()
const orderStore = useOrderStore()
const router = useRouter()
const customerTripSummary = ref([])

const canEdit = () => userStore.hasPermission('mediumHigh') || userStore.hasRole('Asesor Comercial')

onMounted(async () => {
  const idCustomerTrip = route.params.id
  customerTrip.value = (await customerTripService.getCustomerTripsById(idCustomerTrip)).data
  activities.value = (await activityService.getActivitiesByCutomerTrip(idCustomerTrip)).data
  orders.value = (await orderService.getOrdersByCutomerTrip(idCustomerTrip)).data
  invoices.value = (await invoiceService.getInvoiceByCutomerTrip(idCustomerTrip)).data
  customerTripSummary.value = (
    await customerTripService.getCustomerTripSummary(idCustomerTrip)
  ).data
})

const edit = async () => {
  const responseUser = await alertService.editElement(
    customerTrip.value.id_customer_trip,
    'Viaje del Cliente'
  )
  if (responseUser.isConfirmed) {
    customerTripStore.setCustomerTrip(customerTrip.value)
    router.push('/customerTripForm')
  }
}

const createOrder = async () => {
  const responseUser = await alertService.createElement('Orden')
  if (responseUser.isConfirmed) {
    orderStore.clearOrder()
    customerTripStore.setCustomerTrip(customerTrip.value)
    router.push('/orderForm')
  }
}
</script>

<template>
  <div v-if="customerTrip" class="customer-trip-page">
    <div class="customer-trip-card-wrapper">
      <CustomerTripInfo :customerTrip="customerTrip"></CustomerTripInfo>
    </div>

    <section class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Resumen</h2>
      </div>
      <CustomerTripSummaryTable
        :customerTripSummary="customerTripSummary"
      ></CustomerTripSummaryTable>
      <div v-if="canEdit()" class="actions-bar">
        <button class="btn btn-secondary" @click="createOrder">Crear Orden</button>
        <button class="btn btn-primary" @click="edit">Editar Viaje de Cliente</button>
      </div>
    </section>

    <section class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Actividades</h2>
      </div>
      <ActivityTable :activities="activities" :itemsScale="3"></ActivityTable>
    </section>

    <section class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Ordenes</h2>
      </div>
      <OrderTable :orders="orders" :itemsScale="3"></OrderTable>
    </section>

    <section class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Facturas</h2>
      </div>
      <InvoiceTable :invoices="invoices" :items-scale="3"></InvoiceTable>
    </section>

    <section class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Comentarios en Actividades</h2>
      </div>
      <ActivityComments :activities="activities"></ActivityComments>
    </section>
  </div>

  <div v-else class="loading">
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.customer-trip-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.customer-trip-card-wrapper {
  width: 100%;
  margin-bottom: 24px;
}

.detail-section {
  margin-bottom: 32px;
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

@media (max-width: 768px) {
  .customer-trip-page {
    padding: 20px;
  }
}
</style>
