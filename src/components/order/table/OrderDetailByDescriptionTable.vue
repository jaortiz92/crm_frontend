<script setup>
import { defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  orderDetailsByDescription: {
    type: Array,
    default: () => []
  }
})

const { orderDetailsByDescription } = toRefs(props)
</script>

<template>
  <div v-if="orderDetailsByDescription.length > 0">
    <table class="table-order-details">
      <thead>
        <tr>
          <th>Item</th>
          <th>Descripción</th>
          <th>Cantidad</th>
          <th>Valor Sin IVA</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in orderDetailsByDescription" :key="item.id_order_detail">
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
.table-orders {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
