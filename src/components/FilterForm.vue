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
const checkboxTouched = reactive({})

const applyFilter = () => {
  emit('filter', filterValues, checkboxTouched)
}

const resetFilter = () => {
  props.filterFields.forEach((field) => {
    filterValues[field.key] = ''
    checkboxTouched[field.key] = false
  })
  emit('filter', filterValues, checkboxTouched)
}

props.filterFields.forEach((field) => {
  filterValues[field.key] = ''
  checkboxTouched[field.key] = false
})

const handleCheckboxChange = (key) => {
  checkboxTouched[key] = true
}
</script>

<template>
  <div class="filter-card">
    <div class="section-header">
      <div class="section-accent"></div>
      <h2 class="section-title">Filtros</h2>
    </div>
    <form @submit.prevent="applyFilter">
      <div class="filter-grid">
        <div v-for="field in filterFields" :key="field.key" class="filter-field">
          <label :for="field.key">{{ field.label }}</label>
          <input
            :id="field.key"
            v-model="filterValues[field.key]"
            :type="field.type"
            @change="handleCheckboxChange(field.key)"
          />
        </div>
      </div>
      <div class="actions-bar">
        <button type="button" class="btn btn-secondary" @click="resetFilter">Limpiar</button>
        <button type="submit" class="btn btn-primary">Aplicar Filtro</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.filter-card {
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: var(--border-radius-size, 8px);
  padding: 20px;
  margin-bottom: 24px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #616161);
}

.filter-field input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text-primary, #070707);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.filter-field input:focus {
  outline: none;
  border-color: var(--color-brand, #03658c);
}

.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}
</style>
