<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { orderService } from '@/services/orderService'
import { invoiceService } from '@/services/invoiceService'

import OrderDetailTable from '@/components/order/OrderDetailTable.vue'
import OrderInfo from '@/components/order/OrderInfo.vue'
import InvoiceTable from '@/components/invoice/InvoiceTable.vue'
import { useOrderStore } from '@/stores/orderStore'

const route = useRoute()
const orderDetails = ref([])
const order = ref(null)
const invoices = ref([])
const orderStore = useOrderStore()
const router = useRouter()

onMounted(async () => {
  const idOrder = route.params.id
  order.value = (await orderService.getOrderWithDetails(idOrder)).data
  if (order.value) {
    orderDetails.value = order.value.order_details
    delete order.value.order_details
  }
  invoices.value = (await invoiceService.getInvoiceByOrder(idOrder)).data
})

const edit = async () => {
  const responseUser = await alertService.editElement(order.value.id_order, 'Tarea')
  if (responseUser.isConfirmed) {
    orderStore.setOrder(order.value)
    router.push('/orderForm')
  }
}
</script>

<template>
  <div v-if="order">
    <div class="order">
      <div class="order-header">
        <OrderInfo :order="order"></OrderInfo>
      </div>
      <div>
        <h2>Facturas</h2>
        <InvoiceTable :invoices="invoices"></InvoiceTable>
      </div>
      <div class="order-detail">
        <h2>Detalle Orden</h2>
        <OrderDetailTable :orderDetails="orderDetails"></OrderDetailTable>
      </div>
    </div>
    <div class="button-edit">
      <button @click="edit">Editar</button>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.order-header {
  max-width: 1800px;
  min-width: 500px;
  margin: 10px;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: var(--border-radius-size);
  box-shadow: 0 2px 10px var(--shadow);
}
</style>
