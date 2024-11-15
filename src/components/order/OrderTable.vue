<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  orders: {
    type: Array,
    default: () => []
  },
  additionalInfo: {
    type: Boolean,
    default: false
  },
  itemsScale: {
    type: Number,
    default: 15
  }
})

const { orders, additionalInfo, itemsScale } = toRefs(props)
const itemsToShow = ref(itemsScale.value)
const limitedItems = computed(() => {
  return orders.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
</script>

<template>
  <div v-if="orders.length > 0">
    <table class="table-orders">
      <thead>
        <tr>
          <th>ID</th>
          <th>Fecha</th>
          <th v-if="additionalInfo">Cliente</th>
          <th>Vendedor</th>
          <th v-if="additionalInfo">Temporada</th>
          <th v-if="additionalInfo">Linea</th>
          <th>Cantidades</th>
          <th>Valor Sin impuestos</th>
          <th>Total</th>
          <th v-if="additionalInfo">Ciudad</th>
          <th>Forma de pago</th>
          <th>Detalles</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_order">
          <td>{{ item.id_order }}</td>
          <td>{{ item.date_order }}</td>
          <td v-if="additionalInfo">{{ item.customer_trip.customer.company_name }}</td>
          <td>{{ item.seller.first_name }} {{ item.seller.last_name }}</td>
          <td v-if="additionalInfo">{{ item.customer_trip.collection.short_collection_name }}</td>
          <td v-if="additionalInfo">{{ item.customer_trip.collection.line.line_name }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.total_quantities) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.total_without_tax) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.total_with_tax) }}</td>
          <td v-if="additionalInfo">{{ item.customer_trip.customer.city.city_name }}</td>
          <td>{{ item.payment_method.payment_method_name }}</td>
          <router-link :to="{ name: 'OrderDetail', params: { id: item.id_order } }">
            Ver mas
          </router-link>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < orders.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>Sin ordenes</h4>
  </div>
</template>

<style scoped>
.table-orders {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
