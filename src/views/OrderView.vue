<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import OrderTable from '@/components/order/OrderTable.vue'

import { alertService } from '@/services/alertService'
import { orderService } from '@/services/orderService'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const orders = ref([])

const addOrders = async () => {
  try {
    const response = await orderService.getOrders(skip, limit)
    orders.value = response.data
  } catch (error) {
    alertService.generalError('Las ordenes pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addOrders()
  }
}

addDataUser()
</script>

<template>
  <main>
    <div>
      <h3>Ordenes</h3>
      <OrderTable :orders="orders" :additionalInfo="true"></OrderTable>
    </div>
  </main>
</template>
