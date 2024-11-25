<template>
  <form @submit.prevent="submitForm">
    <div v-for="field in fields" :key="field.key" class="form-group">
      <label :for="field.key">{{ field.label }}</label>
      <select
        v-if="field.type === 'select'"
        v-model="formData[field.key]"
        :required="formData[field.isRequired]"
      >
        <option v-for="option in field.options" :key="option[0]" :value="option[0]">
          {{ option[1] }}
        </option>
      </select>
      <textarea
        v-else-if="field.type === 'textarea'"
        v-model="formData[field.key]"
        :type="field.type"
        :required="formData[field.isRequired]"
      ></textarea>
      <input v-else v-model="formData[field.key]" :type="field.type" required />
    </div>
    <button type="submit">{{ submitLabel }}</button>
  </form>
</template>

<script setup>
import { reactive } from 'vue'
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  fields: {
    type: Array,
    required: true
  },
  submitLabel: {
    type: String,
    default: 'Enviar'
  },
  initialData: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['submit'])

const formData = reactive({ ...props.initialData })

const submitForm = () => {
  emit('submit', formData)
}
</script>

<style scoped>
.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
}

input,
select,
textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  padding: 0.7rem 1.5rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
