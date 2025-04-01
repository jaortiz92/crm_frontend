<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const itemsScale = ref(15)
const itemsToShow = ref(itemsScale.value)
const props = defineProps({
  customerTrips: {
    type: Array,
    default: () => []
  },
  additionalInfo: {
    type: Boolean,
    default: false
  }
})

const { customerTrips, additionalInfo } = toRefs(props)
const limitedItems = computed(() => {
  return customerTrips.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
const showAll = () => {
  itemsToShow.value = customerTrips.value.length
}
</script>

<template>
  <div v-if="customerTrips.length > 0">
    <table class="table-customerTrips">
      <thead>
        <tr>
          <th>ID Viaje de Cliente</th>
          <th v-if="additionalInfo">Cliente</th>
          <th>Colección</th>
          <th>Fecha Temporada</th>
          <th>Presupuesto Prendas</th>
          <th>Presupuesto Valor</th>
          <th>Linea</th>
          <th>Asesor</th>
          <th>Ordenó</th>
          <th>Detalles</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_customer_trips">
          <td>{{ item.id_customer_trip }}</td>
          <td v-if="additionalInfo">{{ item.customer.company_name }}</td>
          <td>{{ item.collection.short_collection_name }}</td>
          <td>{{ item.collection.year }} Q{{ item.collection.quarter }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.budget) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.budget_quantities) }}</td>
          <td>{{ item.collection.line.line_name }}</td>
          <td>{{ item.seller.first_name }} {{ item.seller.last_name }}</td>
          <td :class="{ checkbox: true, checked: item.closed }"></td>
          <td>
            <router-link
              :to="{ name: 'CustomerTripDetail', params: { id: item.id_customer_trip } }"
            >
              Ver mas
            </router-link>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-all" v-if="itemsToShow < customerTrips.length" @click="showAll">
        Mostrar Todo
      </button>
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < customerTrips.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>Clientes sin viajes asignados</h4>
  </div>
</template>

<style scoped>
.table-customerTrips {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
