<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'

const itemsScale = ref(20)
const itemsToShow = ref(itemsScale.value)
const props = defineProps({
  contacts: Array
})

const { contacts } = toRefs(props)
const limitedItems = computed(() => {
  return contacts.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
</script>

<template>
  <div v-if="contacts.length > 0">
    <table class="table-contacts">
      <thead>
        <tr>
          <th>ID</th>
          <th>Nombre Cliente</th>
          <th>Documento</th>
          <th>Telefono</th>
          <th>Cargo</th>
          <th>Detalles</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_contact">
          <td>{{ item.id_contact }}</td>
          <td>{{ item.first_name }} {{ item.last_name }}</td>
          <td>{{ item.document }}</td>
          <td>{{ item.phone }}</td>
          <td>{{ item.role.role_name }}</td>
          <td>
            Ver mas
            <!--      <router-link :to="{ name: 'contactDetail', params: { id: item.id_contact } }">
              Ver mas
            </router-link>-->
          </td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < contacts.length" @click="showMore">
        Mostrar más
      </button>
    </div>
  </div>
  <div v-else>
    <h4>El Usuario no cuenta con clientes asignados</h4>
  </div>
</template>

<style scoped>
.table-contacts {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}
</style>
