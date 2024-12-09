<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'

const props = defineProps({
  initialRating: {
    type: Object,
    default: () => basicModels.rating
  },
  options: {
    type: Object,
    default: () => ({
      ratingCategories: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { initialRating, options, isEdit } = toRefs(props)

const rating = ref({ ...initialRating.value })

const emit = defineEmits(['save'])
const save = () => {
  emit('save', rating.value)
}
</script>

<template>
  <form @submit.prevent="save" class="form-rating">
    <div class="field-input">
      <label>Fecha</label>
      <input v-model="rating.date_updated" type="date" required />
    </div>
    <div class="field-input">
      <label>Categoria</label>
      <select v-model="rating.id_rating_category" required>
        <option
          v-for="option in options.ratingCategories"
          :key="option.id_rating_category"
          :value="option.id_rating_category"
        >
          {{ option.rating_category }} ({{ option.level }})
        </option>
      </select>
    </div>
    <div class="field-input">
      <label>Comentario</label>
      <textarea v-model="rating.comments" required></textarea>
    </div>
    <button type="submit">{{ isEdit ? `Actualizar Evaluación` : 'Crear Evaluación' }}</button>
  </form>
</template>

<style scoped>
.form-rating {
  max-width: 600px;
  margin: 0 auto;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  box-shadow: 0 4px 8px var(--shadow);
}

.checkbox {
  width: auto;
}

input,
select,
textarea {
  max-width: none;
}

.company-name {
  text-align: left;
  margin: 5px;
  padding: 5px;
  border: 1px solid var(--gray-border);
  color: var(--gray-border);
}

@media (max-width: 480px) {
  .form-rating {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
