<script setup>
import { defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  invoiceDetailsByBrand: {
    type: Array,
    default: () => []
  }
})

const { invoiceDetailsByBrand } = toRefs(props)
</script>

<template>
  <div v-if="invoiceDetailsByBrand.length > 0">
    <table class="table-invoice-details">
      <thead>
        <tr>
          <th>Item</th>
          <th>Marca</th>
          <th>Genero</th>
          <th>Cantidad</th>
          <th>Descuento</th>
          <th>Valor Sin IVA</th>
          <th>Valor Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in invoiceDetailsByBrand" :key="item.id_invoice_detail">
          <td>{{ index + 1 }}</td>
          <td>{{ item.brand_name }}</td>
          <td>{{ formatters.formatterGender(item.gender) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.quantity) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.discount) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.value_without_tax) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.value_with_tax) }}</td>
        </tr>
      </tbody>
    </table>
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
