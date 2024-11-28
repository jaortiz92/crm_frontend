<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  invoiceDetails: {
    type: Array,
    default: () => []
  },
  itemsScale: {
    type: Number,
    default: 20
  }
})

const { invoiceDetails, itemsScale } = toRefs(props)
const itemsToShow = ref(itemsScale.value)
const limitedItems = computed(() => {
  return invoiceDetails.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
</script>

<template>
  <div v-if="invoiceDetails.length > 0">
    <table class="table-invoice-details">
      <thead>
        <tr>
          <th>Item</th>
          <th>Producto</th>
          <th>Marca</th>
          <th>Color</th>
          <th>Talla</th>
          <th>Genero</th>
          <th>Valor Unidad</th>
          <th>Cantidad</th>
          <th>Valor Sin IVA</th>
          <th>Descuento</th>
          <th>Valor Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in limitedItems" :key="item.id_invoice_detail">
          <td>{{ index + 1 }}</td>
          <td>{{ item.product }}</td>
          <td>{{ item.brand.brand_name }}</td>
          <td>{{ item.color }}</td>
          <td>{{ item.size }}</td>
          <td>{{ formatters.formatterGender(item.gender) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.unit_value) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.quantity) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.value_without_tax) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.discount) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.value_with_tax) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < invoiceDetails.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>Factura sin detalle</h4>
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
