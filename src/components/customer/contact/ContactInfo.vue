<script setup>
import { defineProps, toRefs, defineEmits } from 'vue'

import { formatters } from '@/plugins/formatters.js'

import ModalModel from '@/components/ModalModel.vue'

const props = defineProps({
  contact: Object,
  isModalContactVisible: Boolean
})

const { contact, isModalContactVisible } = toRefs(props)
const emit = defineEmits(['close', 'edit'])
const close = () => {
  emit('close')
}

const edit = () => {
  emit('edit', contact)
}
</script>

<template>
  <ModalModel :isVisible="isModalContactVisible" @close="close" @edit="edit">
    <template #header>
      <h3>{{ contact.first_name }} {{ contact.last_name }}</h3>
    </template>
    <template #body>
      <p><strong>Documento:</strong> {{ contact.document }}</p>
      <p><strong>Correo:</strong> {{ contact.email }}</p>
      <p><strong>Fecha Nacimiento:</strong> {{ contact.birth_date }}</p>
      <p><strong>Genero:</strong> {{ formatters.formatterGender(contact.gender) }}</p>
      <p><strong>Cliente:</strong> {{ contact.customer.company_name }}</p>
      <p><strong>Ciudad:</strong> {{ contact.city.city_name }}</p>
      <p><strong>Departamento:</strong> {{ contact.city.department.department_name }}</p>
      <p><strong>Detalles relevantes:</strong> {{ contact.relevant_details }}</p>
      <strong>Activo:</strong> <span :class="{ checkbox: true, checked: contact.active }"></span>
    </template>
  </ModalModel>
</template>
