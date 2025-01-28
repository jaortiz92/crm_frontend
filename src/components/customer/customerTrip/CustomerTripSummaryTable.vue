<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const itemsScale = ref(20)
const itemsToShow = ref(itemsScale.value)
const props = defineProps({
  customerTripSummary: Array
})

const { customerTripSummary } = toRefs(props)
const limitedItems = computed(() => {
  return customerTripSummary.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
const showAll = () => {
  itemsToShow.value = customerTripSummary.value.length
}
</script>

<template>
  <div v-if="customerTripSummary.length > 0">
    <table class="table-customer-summary">
      <thead>
        <tr>
          <th>Presupuesto Cantidades</th>
          <th>Presupuesto</th>
          <th>Ordenes</th>
          <th>Cantidad Ordenes</th>
          <th>Valor Ordenes</th>
          <th>Facturas</th>
          <th>Cantidad Facturas</th>
          <th>Valor Facturas</th>
          <th>Descuentos Facturas</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_customer">
          <td>{{ formatters.formatterGeneralNumber(item.budget_quantities) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.budget) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.orders) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.order_quantities) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.order_without_tax) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.invoices) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.invoice_quantities) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.invoice_without_tax) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.invoice_discount) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-all" v-if="itemsToShow < customerTripSummary.length" @click="showAll">
        Mostrar Todo
      </button>
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < customerTripSummary.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>El cliente no cuenta información</h4>
  </div>
</template>

<style scoped>
.table-customer-summary {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
