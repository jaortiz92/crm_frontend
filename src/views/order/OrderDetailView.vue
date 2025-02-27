<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { orderService } from '@/services/orderService'
import { invoiceService } from '@/services/invoiceService'
import { advanceService } from '@/services/advanceService'

import OrderDetailTable from '@/components/order/OrderDetailTable.vue'
import OrderInfo from '@/components/order/OrderInfo.vue'
import InvoiceTable from '@/components/invoice/InvoiceTable.vue'
import AdvanceTable from '@/components/advance/AdvanceTable.vue'
import { useOrderStore } from '@/stores/orderStore'
import OrderDetailByBrandTable from '@/components/order/OrderDetailByBrandTable.vue'

const route = useRoute()
const orderDetails = ref([])
const orderDetailsByBrand = ref([])
const order = ref(null)
const invoices = ref([])
const advances = ref([])
const orderStore = useOrderStore()
const router = useRouter()

onMounted(async () => {
  const idOrder = route.params.id
  order.value = (await orderService.getOrderWithDetails(idOrder)).data
  if (order.value) {
    orderDetails.value = order.value.order_details
    delete order.value.order_details
    orderDetailsByBrand.value = (await orderService.getOrderDetailsByBrandAndIdOrder(idOrder)).data
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
</script>

<template>
  <div v-if="order">
    <div class="order">
      <div class="order-header">
        <OrderInfo :order="order"></OrderInfo>
      </div>
      <div>
        <h2>Anticipos</h2>
        <AdvanceTable :advances="advances"></AdvanceTable>
        <div class="button-edit">
          <button @click="createAdvance">Crear Anticipo</button>
        </div>
      </div>
      <div>
        <h2>Facturas</h2>
        <InvoiceTable :invoices="invoices"></InvoiceTable>
      </div>
      <div class="order-detail">
        <h2>Resumen Detalle Orden</h2>
        <OrderDetailByBrandTable
          :orderDetailsByBrand="orderDetailsByBrand"
        ></OrderDetailByBrandTable>
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
