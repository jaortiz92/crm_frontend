<script setup>
import { ref, computed, toRefs, defineProps } from 'vue'

const props = defineProps({
  tasks: {
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

const { tasks, additionalInfo, itemsScale } = toRefs(props)
const itemsToShow = ref(itemsScale.value)

const limitedItems = computed(() => {
  return tasks.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
</script>

<template>
  <div v-if="tasks.length > 0">
    <table class="table-tasks">
      <thead>
        <tr>
          <th>ID Tarea</th>
          <th>Cliente</th>
          <th>Creador Tarea</th>
          <th>Tarea</th>
          <th>Ciudad</th>
          <th>Responsable</th>
          <th>Fecha Creacion</th>
          <th v-if="additionalInfo">Completado</th>
          <th v-if="additionalInfo">Fecha Completado</th>
          <th>Detalles</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_task">
          <td>{{ item.id_task }}</td>
          <td>{{ item.customer.company_name }}</td>
          <td>{{ item.creator_tasks.first_name }} {{ item.creator_tasks.last_name }}</td>
          <td>{{ item.task }}</td>
          <td>{{ item.customer.city.city_name }}</td>
          <td>{{ item.responsible_task.first_name }} {{ item.responsible_task.last_name }}</td>
          <td>{{ item.creation_date }}</td>
          <td v-if="additionalInfo" :class="{ checkbox: true, checked: item.completed }"></td>
          <td v-if="additionalInfo">{{ item.execution_date }}</td>
          <router-link :to="{ name: 'TaskDetail', params: { id: item.id_task } }">
            Más detalles
          </router-link>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < tasks.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>El Usuario no cuenta con actividades pendientes por ejecutar</h4>
  </div>
</template>

<style scoped>
.table-tasks {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
