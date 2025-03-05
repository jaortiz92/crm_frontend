<script setup>
import { defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  invoiceDetailsByDescription: {
    type: Array,
    default: () => []
  }
})

const { invoiceDetailsByDescription } = toRefs(props)
</script>

<template>
  <div v-if="invoiceDetailsByDescription.length > 0">
    <table class="table-invoice-details">
      <thead>
        <tr>
          <th>Item</th>
          <th>Descripción</th>
          <th>Cantidad</th>
          <th>Valor Sin IVA</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in invoiceDetailsByDescription" :key="item.id_invoice_detail">
          <td>{{ index + 1 }}</td>
          <td>{{ item.description }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.quantity) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.value_without_tax) }}</td>
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
