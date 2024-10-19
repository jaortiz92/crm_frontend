<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'

const itemsScale = ref(5)
const itemsToShow = ref(itemsScale.value)
const props = defineProps({
  activities: Array
})

const { activities } = toRefs(props)
const limitedItems = computed(() => {
  return activities.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
</script>

<template>
  <div v-if="activities.length > 0">
    <table class="table-activities">
      <thead>
        <tr>
          <th>ID</th>
          <th>Cliente</th>
          <th>Vendedor</th>
          <th>Temporada</th>
          <th>Linea</th>
          <th>Actividad</th>
          <th>Ciudad</th>
          <th>Responsable</th>
          <th>Creacion</th>
          <th>Fecha para ejecutar</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_activity">
          <td>{{ item.id_activity }}</td>
          <td>{{ item.customer_trip.customer.company_name }}</td>
          <td>
            {{ item.customer_trip.seller.first_name }} {{ item.customer_trip.seller.last_name }}
          </td>
          <td>{{ item.customer_trip.collection.short_collection_name }}</td>
          <td>{{ item.customer_trip.collection.line.line_name }}</td>
          <td>{{ item.activity_type.activity }}</td>
          <td>{{ item.customer_trip.customer.city.city_name }}</td>
          <td>{{ item.user_activities.first_name }} {{ item.user_activities.last_name }}</td>
          <td>{{ item.creation_date }}</td>
          <td>{{ item.estimated_date }}</td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < activities.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>El Usuario no cuenta con actividades pendientes por ejecutar</h4>
  </div>
</template>

<style scoped>
.table-activities {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
