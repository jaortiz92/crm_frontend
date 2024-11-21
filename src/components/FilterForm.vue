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

props.filterFields.forEach((field) => {
  filterValues[field.key] = ''
  checkboxTouched[field.key] = false
})

const handleCheckboxChange = (key) => {
  checkboxTouched[key] = true
}
</script>

<template>
  <div class="filter-form-container">
    <form @submit.prevent="applyFilter">
      <div class="filter-form">
        <div v-for="field in filterFields" :key="field.key" class="field">
          <div class="field-block">
            <label :for="field.key">{{ field.label }}</label>
            <input
              v-model="filterValues[field.key]"
              :type="field.type"
              @change="handleCheckboxChange(field.key)"
            />
          </div>
        </div>
      </div>
      <div class="button-form">
        <button type="submit">Aplicar Filtro</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.filter-form-container {
  width: 90%;
  padding: 5px;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  margin: 10px auto;
  box-shadow: 0 4px 8px var(--shadow);
}

.filter-form-container input {
  padding: 0.5rem;
  border: 1px solid var(--gray-border);
  border-radius: 4px;
  min-width: 100px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.3s;
}

/* Efecto de enfoque en los campos de entrada */
.filter-form-container input:focus {
  outline: none;
  border-color: var(--normal-color);
}

.filter-form {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-around;
}

.field {
  flex: 1 1 calc(15% - 10px);
  padding: 7px;
  border: 1px solid var(--light-border);
  border-radius: 5px;
  box-shadow: 0 1px 4px var(--shadow);
  min-width: 150px;
}

.field-block {
  place-self: center;
}

input {
  min-height: 25px;
}

.button-form {
  margin-top: 10px;
}
</style>
