<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useOrderStore } from '@/stores/orderStore'

import OrderTable from '@/components/order/table/OrderTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { orderService } from '@/services/orderService'

import { filterFormat } from '@/plugins/filterFormat'

const userStore = useUserStore()
const id_user = ref('')
const skip = 0
const limit = 500
const orders = ref([])
const filteredOrders = ref([])
const router = useRouter()
const orderStore = useOrderStore()

const addOrders = async () => {
  try {
    const response = await orderService.getOrders(skip, limit)
    orders.value = response.data
    filteredOrders.value = [...orders.value]
  } catch (error) {
    alertService.generalError('Las ordenes no se pudieron cargar')
  }
}

const orderFilterFields = [
  filterFormat.companyName,
  filterFormat.idOrder,
  filterFormat.dateFrom,
  filterFormat.dateUntil,
  filterFormat.seller,
  filterFormat.shortCollectionName,
  filterFormat.lineName,
  filterFormat.city,
  filterFormat.paymentMethod
]

const filter = (filterValues) => {
  filteredOrders.value = orders.value.filter(
    (order) =>
      (!filterValues.companyName ||
        order.customer_trip.customer.company_name
          .toLowerCase()
          .includes(filterValues.companyName.toLowerCase())) &&
      (!filterValues.idOrder || order.id_order === filterValues.idOrder) &&
      (!filterValues.dateFrom || order.date_order >= filterValues.dateFrom) &&
      (!filterValues.dateUntil || order.date_order <= filterValues.dateUntil) &&
      (!filterValues.seller ||
        order.seller.last_name.toLowerCase().includes(filterValues.seller.toLowerCase()) ||
        order.seller.first_name.toLowerCase().includes(filterValues.seller.toLowerCase())) &&
      (!filterValues.shortCollectionName ||
        order.customer_trip.collection.short_collection_name
          .toLowerCase()
          .includes(filterValues.shortCollectionName.toLowerCase())) &&
      (!filterValues.lineName ||
        order.customer_trip.collection.line.line_name
          .toLowerCase()
          .includes(filterValues.lineName.toLowerCase())) &&
      (!filterValues.city ||
        order.customer_trip.customer.city.city_name
          .toLowerCase()
          .includes(filterValues.city.toLowerCase())) &&
      (!filterValues.paymentMethod ||
        order.payment_method.payment_method_name
          .toLowerCase()
          .includes(filterValues.paymentMethod.toLowerCase()))
  )
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addOrders()
  }
}

const create = () => {
  orderStore.clearOrder()
  router.push('/orderForm')
}

addDataUser()
</script>

<template>
  <div class="button-create">
    <button @click="create">Crear</button>
  </div>
  <main>
    <div>
      <h3>Ordenes</h3>
      <FilterForm :filterFields="orderFilterFields" @filter="filter" />
      <OrderTable :orders="filteredOrders" :additionalInfo="true"></OrderTable>
    </div>
  </main>
</template>
