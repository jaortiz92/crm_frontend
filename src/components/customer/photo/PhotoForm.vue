<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'

const props = defineProps({
  initialPhoto: {
    type: Object,
    default: () => basicModels.photo
  },
  options: {
    type: Object,
    default: () => ({
      customers: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { initialPhoto, options, isEdit } = toRefs(props)

const photo = ref({ ...initialPhoto.value })

const emit = defineEmits(['save'])
const save = () => {
  emit('save', photo.value)
}
</script>

<template>
  <form @submit.prevent="save" class="form-photo">
    <div class="field-input">
      <label>Cliente</label>
      <select v-model="photo.id_customer" required>
        <option
          v-for="option in options.customers"
          :key="option.id_customer"
          :value="option.id_customer"
        >
          {{ option.company_name }}
        </option>
      </select>
    </div>
    <div class="field-input">
      <label>URL</label>
      <input type="url" v-model="photo.url_photo" required />
    </div>
    <button type="submit">{{ isEdit ? `Actualizar Evaluación` : 'Crear Evaluación' }}</button>
  </form>
</template>

<style scoped>
.form-photo {
  max-width: 600px;
  margin: 0 auto;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  box-shadow: 0 4px 8px var(--shadow);
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
  .form-photo {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
