<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'

const itemsScale = ref(20)
const itemsToShow = ref(itemsScale.value)
const props = defineProps({
  ratings: Array
})

const { ratings } = toRefs(props)
const limitedItems = computed(() => {
  return ratings.value.slice(0, itemsToShow.value)
})

const emit = defineEmits(['edit'])
const edit = (rating) => {
  emit('edit', rating)
}

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
</script>

<template>
  <div v-if="ratings.length > 0">
    <table class="table-ratings">
      <thead>
        <tr>
          <th>ID Categoria</th>
          <th>Fecha Actualizacion</th>
          <th>Cliente</th>
          <th>Nivel</th>
          <th>Nombre Categoria</th>
          <th>Creador</th>
          <th>Comentarios</th>
          <th>Editar</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_rating">
          <td>{{ item.id_rating }}</td>
          <td>{{ item.date_updated }}</td>
          <td>{{ item.customer.company_name }}</td>
          <td>{{ item.rating_category.level }}</td>
          <td>{{ item.rating_category.rating_category }}</td>
          <td>{{ item.creator.first_name }} {{ item.creator.last_name }}</td>
          <td>{{ item.comments }}</td>
          <td>
            <div class="link" @click="edit(item)">Editar</div>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < ratings.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>El Usuario no cuenta con categorias asignados</h4>
  </div>
</template>

<style scoped>
.table-ratings {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}

.link:hover {
  cursor: pointer;
}
</style>
