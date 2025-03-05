<script setup>
import { ref, computed, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  invoices: {
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

const { invoices, additionalInfo, itemsScale } = toRefs(props)
const itemsToShow = ref(itemsScale.value)
const limitedItems = computed(() => {
  return invoices.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
const showAll = () => {
  itemsToShow.value = invoices.value.length
}
</script>

<template>
  <div v-if="invoices.length > 0">
    <table class="table-invoices">
      <thead>
        <tr>
          <th>Numero de Factura</th>
          <th>ID Factura</th>
          <th>ID Orden</th>
          <th>Fecha</th>
          <th v-if="additionalInfo">Cliente</th>
          <th>Asesor</th>
          <th v-if="additionalInfo">Colección</th>
          <th v-if="additionalInfo">Linea</th>
          <th>Cantidades</th>
          <th>Descuento</th>
          <th>Valor Sin impuestos</th>
          <th>Total</th>
          <th v-if="additionalInfo">Ciudad</th>
          <th v-if="additionalInfo">Forma de pago</th>
          <th>Detalles</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_invoice">
          <td>{{ item.invoice_number }}</td>
          <td>{{ item.id_invoice }}-{{ item.key }}</td>
          <td>{{ item.id_order }}</td>
          <td>{{ item.invoice_date }}</td>
          <td v-if="additionalInfo">{{ item.order.customer_trip.customer.company_name }}</td>
          <td>{{ item.order.seller.first_name }} {{ item.order.seller.last_name }}</td>
          <td v-if="additionalInfo">
            {{ item.order.customer_trip.collection.short_collection_name }}
          </td>
          <td v-if="additionalInfo">{{ item.order.customer_trip.collection.line.line_name }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.total_quantities) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.total_discount) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.total_without_tax) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.total_with_tax) }}</td>
          <td v-if="additionalInfo">{{ item.order.customer_trip.customer.city.city_name }}</td>
          <td v-if="additionalInfo">{{ item.order.payment_method.payment_method_name }}</td>
          <td>
            <router-link :to="{ name: 'InvoiceDetail', params: { id: item.id_invoice } }">
              Ver mas
            </router-link>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-all" v-if="itemsToShow < invoices.length" @click="showAll">
        Mostrar Todo
      </button>
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < invoices.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>Sin facturas</h4>
  </div>
</template>

<style scoped>
.table-invoices {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
