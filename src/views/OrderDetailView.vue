<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import { orderService } from '@/services/orderService'

import OrderDetailTable from '@/components/order/OrderDetailTable.vue'
import OrderInfo from '@/components/order/OrderInfo.vue'

const route = useRoute()
const orderDetails = ref([])
const order = ref(null)

onMounted(async () => {
  const idOrder = route.params.id
  order.value = (await orderService.getOrderWithDetails(idOrder)).data
  if (order.value) {
    orderDetails.value = order.value.order_details
    delete order.value.order_details
  }
})
</script>

<template>
  <div v-if="order">
    <div class="order">
      <div class="order-header">
        <OrderInfo :order="order"></OrderInfo>
      </div>
      <div class="order-detail">
        <OrderDetailTable :orderDetails="orderDetails"></OrderDetailTable>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
    <p>{{ orderDetails }}</p>
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
