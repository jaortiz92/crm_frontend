<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import { customerTripService } from '@/services/customerTripService'
import { activityService } from '@/services/activityService'
import { orderService } from '@/services/orderService'
import { invoiceService } from '@/services/invoiceService'

import CustomerTripInfo from '@/components/customer/customerTrip/CustomerTripInfo.vue'
import ActivityTable from '@/components/activity/ActivityTable.vue'
import OrderTable from '@/components/order/OrderTable.vue'
import InvoiceTable from '@/components/invoice/InvoiceTable.vue'

const route = useRoute()
const customerTrip = ref(null)
const activities = ref([])
const orders = ref([])
const invoices = ref([])

onMounted(async () => {
  const idCustomerTrip = route.params.id
  customerTrip.value = (await customerTripService.getCustomerTripsById(idCustomerTrip)).data
  activities.value = (await activityService.getActivitiesByCutomerTrip(idCustomerTrip)).data
  orders.value = (await orderService.getOrdersByCutomerTrip(idCustomerTrip)).data
  invoices.value = (await invoiceService.getInvoiceByCutomerTrip(idCustomerTrip)).data
})
</script>

<template>
  <div v-if="customerTrip">
    <div class="customer-trip">
      <div class="customer-trip-detail">
        <CustomerTripInfo :customerTrip="customerTrip"></CustomerTripInfo>
      </div>
      <div class="customer-trip-additional">
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

h2 {
  text-align: center;
  font-size: 150%;
  margin-top: 10px;
}
</style>
