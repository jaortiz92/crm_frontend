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

const route = useRoute()
const customerTrip = ref(null)
const activities = ref([])
const orders = ref([])
const invoices = ref([])
const userStore = useUserStore()
const customerTripStore = useCustomerTripStore()
const router = useRouter()
const customerTripSummary = ref([])

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
</script>

<template>
  <div>
    <h1>Viaje de Cliente</h1>
  </div>
  <div v-if="customerTrip">
    <div class="customer-trip">
      <div class="customer-trip-detail">
        <CustomerTripInfo :customerTrip="customerTrip"></CustomerTripInfo>
      </div>
      <div class="customer-trip-additional">
        <div class="customer_trip_summary">
          <CustomerTripSummaryTable
            :customerTripSummary="customerTripSummary"
          ></CustomerTripSummaryTable>
        </div>
        <div class="activities">
          <h2>Actividades</h2>
          <ActivityTable :activities="activities" :itemsScale="3"></ActivityTable>
        </div>
        <div class="orders">
          <h2>Ordenes</h2>
          <OrderTable :orders="orders" :itemsScale="3"></OrderTable>
        </div>
      </div>
    </div>
    <div class="invoices">
      <h2>Facturas</h2>
      <InvoiceTable :invoices="invoices" :items-scale="3"></InvoiceTable>
    </div>
    <div>
      <h2>Comentarios en Actividades</h2>
      <ActivityComments :activities="activities"></ActivityComments>
    </div>
    <div
      v-if="userStore.hasPermission('mediumHigh') | userStore.hasRole('Asesor Comercial')"
      class="button-edit"
    >
      <button @click="edit">Editar Viaje de Cliente</button>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.customer-trip {
  display: flex;
}
.customer-trip-detail {
  max-width: 600px;
  min-width: 500px;
  margin: 10px;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: var(--border-radius-size);
  box-shadow: 0 2px 10px var(--shadow);
}

.customer-trip-additional {
  flex-grow: 1;
}
</style>
