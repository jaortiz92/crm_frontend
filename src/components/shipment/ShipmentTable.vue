<script setup>
import { ref, computed, toRefs, defineProps } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  shipments: {
    type: Array,
    default: () => []
  },
  additionalInfo: {
    type: Boolean,
    default: false
  },
  itemsScale: {
    type: Number,
    default: 5
  }
})

const { shipments, additionalInfo, itemsScale } = toRefs(props)
const itemsToShow = ref(itemsScale.value)

const limitedItems = computed(() => {
  return shipments.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
const showAll = () => {
  itemsToShow.value = shipments.value.length
}
</script>

<template>
  <div v-if="shipments.length > 0">
    <table class="table-shipments">
      <thead>
        <tr>
          <th>ID Envio</th>
          <th>Factura</th>
          <th>Fecha Envio</th>
          <th>Transportadora</th>
          <th>No Guia</th>
          <th>Costo</th>
          <th v-if="additionalInfo">Fecha Estimada de Entrega</th>
          <th>Recibido</th>
          <th v-if="additionalInfo">Fecha Recibido</th>
          <th>Detalles</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_shipment">
          <td>{{ item.id_shipment }}</td>
          <td>{{ item.invoice.invoice_number }}</td>
          <td>{{ item.shipment_date }}</td>
          <td>{{ item.carrier }}</td>
          <td>{{ item.tracking_number }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.shipment_cost) }}</td>
          <td v-if="additionalInfo">{{ item.estimated_delivery_date }}</td>
          <td :class="{ checkbox: true, checked: item.received }"></td>
          <td v-if="additionalInfo">{{ item.received ? item.received_date : 'Sin entregar' }}</td>
          <td>Más detalles</td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-all" v-if="itemsToShow < shipments.length" @click="showAll">
        Mostrar Todo
      </button>
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < shipments.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>El Usuario no cuenta con envios</h4>
  </div>
</template>

<style scoped>
.table-shipments {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
