<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  orderDetails: {
    type: Array,
    default: () => []
  },
  itemsScale: {
    type: Number,
    default: 20
  }
})

const { orderDetails, itemsScale } = toRefs(props)
const itemsToShow = ref(itemsScale.value)
const limitedItems = computed(() => {
  return orderDetails.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
</script>

<template>
  <div v-if="orderDetails.length > 0">
    <table class="table-order-details">
      <thead>
        <tr>
          <th>ID</th>
          <th>Producto</th>
          <th>Marca</th>
          <th>Color</th>
          <th>Talla</th>
          <th>Genero</th>
          <th>Valor Unidad</th>
          <th>Cantidad</th>
          <th>Valor Sin IVA</th>
          <th>Valor Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_order_detail">
          <td>{{ item.id_order_detail }}</td>
          <td>{{ item.product }}</td>
          <td>{{ item.brand.brand_name }}</td>
          <td>{{ item.color }}</td>
          <td>{{ item.size }}</td>
          <td>{{ formatters.formatterGender(item.gender) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.unit_value) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.quantity) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.value_without_tax) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.value_with_tax) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < orderDetails.length" @click="showMore">
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
