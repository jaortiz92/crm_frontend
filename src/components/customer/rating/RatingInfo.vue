<script setup>
import { defineProps, toRefs, defineEmits } from 'vue'

import ModalModel from '@/components/ModalModel.vue'

const props = defineProps({
  rating: Object,
  isModalRatingVisible: Boolean
})

const { rating, isModalRatingVisible } = toRefs(props)
const emit = defineEmits(['close', 'edit'])
const close = () => {
  emit('close')
}
const edit = () => {
  emit('edit')
}
</script>

<template>
  <ModalModel :isVisible="isModalRatingVisible" @close="close" @edit="edit">
    <template #header>
      <h3>{{ rating.customer.company_name }}</h3>
    </template>
    <template #body>
      <p><strong>Categoria:</strong> {{ rating.rating_category.rating_category }}</p>
      <p><strong>Nivel Categoria:</strong> {{ rating.rating_category.level }}</p>
      <p><strong>Comentarios:</strong> {{ rating.comments }}</p>
      <p><strong>Fecha Ultima Actualizacion:</strong> {{ rating.date_updated }}</p>
    </template>
  </ModalModel>
</template>
