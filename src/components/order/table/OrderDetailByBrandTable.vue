<script setup>
import { defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  orderDetailsByBrand: {
    type: Array,
    default: () => []
  }
})

const { orderDetailsByBrand } = toRefs(props)
</script>

<template>
  <div v-if="orderDetailsByBrand.length > 0">
    <table class="table-order-details">
      <thead>
        <tr>
          <th>Item</th>
          <th>Marca</th>
          <th>Genero</th>
          <th>Cantidad</th>
          <th>Valor Sin IVA</th>
          <th>Valor Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in orderDetailsByBrand" :key="item.id_order_detail">
          <td>{{ index + 1 }}</td>
          <td>{{ item.brand_name }}</td>
          <td>{{ formatters.formatterGender(item.gender) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.quantity) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.value_without_tax) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.value_with_tax) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else>
    <h4>Orden sin detalle</h4>
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
