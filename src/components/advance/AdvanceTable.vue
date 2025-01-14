<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  advances: {
    type: Array,
    default: () => []
  },
  itemsScale: {
    type: Number,
    default: 5
  }
})

const { advances, itemsScale } = toRefs(props)
const itemsToShow = ref(itemsScale.value)
const limitedItems = computed(() => {
  return advances.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
const showAll = () => {
  itemsToShow.value = advances.value.length
}
</script>

<template>
  <div v-if="advances.length > 0">
    <table class="table-advances">
      <thead>
        <tr>
          <th>ID Anticipo</th>
          <th>ID Orden</th>
          <th>Fecha de Vencimiento</th>
          <th>%Anticipo</th>
          <th>Valor</th>
          <th>Valor Pagos</th>
          <th>Balance</th>
          <th>Pagado</th>
          <th>Fecha Ultimo Pago</th>
          <th>Editar</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_advance">
          <td>{{ item.id_advance }}</td>
          <td>{{ item.id_order }}</td>
          <td>{{ item.payment_date }}</td>
          <td>{{ formatters.formattedPercentage(item.advance_type) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.amount) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.payment) }}</td>
          <td>{{ formatters.formatterGeneralNumber(item.balance) }}</td>
          <td :class="{ checkbox: true, checked: item.paid }"></td>
          <td>{{ item.last_payment_date }}</td>
          <td>
            <router-link
              :to="{ name: 'AdvanceForm', params: { idOrder: item.id_order, id: item.id_advance } }"
            >
              Editar
            </router-link>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-all" v-if="itemsToShow < advances.length" @click="showAll">
        Mostrar Todo
      </button>
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < advances.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>No existen anticipos</h4>
  </div>
</template>

<style scoped>
.table-advances {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
