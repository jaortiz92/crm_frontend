<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const itemsScale = ref(20)
const itemsToShow = ref(itemsScale.value)
const props = defineProps({
  customers: Array
})

const { customers } = toRefs(props)
const limitedItems = computed(() => {
  return customers.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
const showAll = () => {
  itemsToShow.value = customers.value.length
}
</script>

<template>
  <div v-if="customers.length > 0">
    <table class="table-customers">
      <thead>
        <tr>
          <th>ID Cliente</th>
          <th>Nombre Cliente</th>
          <th>Documento</th>
          <th>Telefono</th>
          <th>Activo</th>
          <th>Detalles</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_customer">
          <td>{{ item.id_customer }}</td>
          <td>{{ item.company_name }}</td>
          <td>{{ item.document }}</td>
          <td>{{ formatters.formatterPhoneNumber(item.phone) }}</td>
          <td :class="{ checkbox: true, checked: item.active }"></td>
          <td>
            <router-link :to="{ name: 'CustomerDetail', params: { id: item.id_customer } }">
              Ver mas
            </router-link>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-all" v-if="itemsToShow < customers.length" @click="showAll">
        Mostrar Todo
      </button>
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < customers.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>El Usuario no cuenta con clientes asignados</h4>
  </div>
</template>

<style scoped>
.table-customers {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
