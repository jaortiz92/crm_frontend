<script setup>
import { reactive } from 'vue'
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  filterFields: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['filter'])
const filterValues = reactive({})

const applyFilter = () => {
  emit('filter', filterValues)
}

props.filterFields.forEach((field) => {
  filterValues[field.key] = ''
})
</script>

<template>
  <div class="filter-form-container">
    <form @submit.prevent="applyFilter" class="filter-form-horizontal">
      <div v-for="field in filterFields" :key="field.key">
        <label :for="field.key">{{ field.label }}</label>
        <input v-model="filterValues[field.key]" :type="field.type" />
      </div>
      <button type="submit">Aplicar Filtro</button>
    </form>
  </div>
</template>

<style scoped>
.filter-form-container {
  display: flex;
  flex-direction: column;
  padding: 5px;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  margin: 10px auto;
  box-shadow: 0 4px 8px var(--shadow);
}

.filter-form-container input {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  min-width: 100px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.3s;
}

/* Efecto de enfoque en los campos de entrada */
.filter-form-container input[type='text']:focus {
  outline: none;
  border-color: #007acc;
}

.filter-form-container button:hover {
  background-color: #005a99;
}

.filter-form-horizontal {
  display: flex;
  gap: 10px;
  align-items: center;
}
</style>
