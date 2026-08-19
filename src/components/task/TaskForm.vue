<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'

import { useUserStore } from '@/stores/userStore'

const props = defineProps({
  initialTask: {
    type: Object,
    default: () => basicModels.task
  },
  options: {
    type: Object,
    default: () => ({
      customers: [],
      users: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const userStore = useUserStore()
const { initialTask, options, isEdit } = toRefs(props)

const task = ref({ ...initialTask.value })

const isDisabledEdit = () => {
  if (userStore.user.id_user !== task.value.id_creator && isEdit.value) {
    return true
  }
  return false
}

const emit = defineEmits(['save'])
const save = () => {
  emit('save', task.value)
}
</script>

<template>
  <form @submit.prevent="save" class="form-card">
    <div class="form-section">
      <h3 class="form-section-title">Información de la tarea</h3>
      <div class="field-input">
        <label>Cliente</label>
        <p class="company-name" v-if="isDisabledEdit() && isEdit">
          {{ task.customer.company_name }}
        </p>
        <select v-else v-model="task.id_customer" required :disabled="isDisabledEdit()">
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
        <label>Responsable</label>
        <select v-model="task.id_responsible" required :disabled="isDisabledEdit()">
          <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
            {{ option.first_name }} {{ option.last_name }}
          </option>
        </select>
      </div>
      <div class="field-input">
        <label>Tarea</label>
        <textarea v-model="task.task" required :disabled="isDisabledEdit()"></textarea>
      </div>
      <div class="field-input">
        <label>¿Completado?</label>
        <input v-model="task.completed" type="checkbox" class="checkbox" />
      </div>
      <div v-if="task.completed" class="field-input">
        <label>Fecha Completado</label>
        <input v-model="task.execution_date" type="date" required />
      </div>
      <div class="field-input">
        <label>Comentario</label>
        <textarea v-model="task.comment"></textarea>
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">
        {{ isEdit ? `Actualizar Tarea` : 'Crear Tarea' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.form-card {
  width: 85%;
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: var(--border-radius-size, 8px);
  padding: 24px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0 0 8px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.field-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-input label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #616161);
}

.field-input input,
.field-input select,
.field-input textarea {
  width: 100%;
  max-width: none;
  padding: 8px 12px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text-primary, #070707);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.field-input input:focus,
.field-input select:focus,
.field-input textarea:focus {
  outline: none;
  border-color: var(--color-brand, #03658c);
}

.field-input textarea {
  min-height: 80px;
  resize: vertical;
}

.field-input .checkbox {
  width: auto;
  margin: 0;
}

.company-name {
  padding: 8px 12px;
  background: var(--color-surface, #f9f9f9);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text-primary, #070707);
  margin: 0;
}

.button-group {
  display: flex;
  justify-content: center;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

@media (max-width: 768px) {
  .form-card {
    padding: 20px;
  }
}
</style>
