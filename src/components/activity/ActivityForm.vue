<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'
import FormattedNumberInput from '@/components/form/FormattedNumberInput.vue'

const props = defineProps({
  initialActivity: {
    type: Object,
    default: () => basicModels.activity
  },
  options: {
    type: Object,
    default: () => ({
      customers: [],
      users: [],
      activityTypes: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { initialActivity, options, isEdit } = toRefs(props)

const activity = ref({ ...initialActivity.value })

const emit = defineEmits(['save'])
const save = () => {
  if (validateAuthorization()) {
    emit('save', activity.value)
  }
}

const alertByAuthorization = () => {
  alertService.generalWarning(
    'Actividad no autorizada',
    'Recuerde que para completar una actividad con presupuesto, primero debe ser autorizada'
  )
}

const alertByBudgetAuthorization = () => {
  alertService.generalWarning(
    'Actividad con gasto mayor',
    'Recuerde que solo debe gastar el valor autorizado.'
  )
}

const validateAuthorization = () => {
  if (
    ((activity.value.completed && activity.value.budget > 0) ||
      (activity.value.completed && activity.value.execution_value > 0)) &&
    !activity.value.authorized
  ) {
    activity.value.completed = false
    activity.value.execution_value = 0

    alertByAuthorization()
    return false
  } else if (
    activity.value.completed &&
    activity.value.execution_value > activity.value.budget_authorized
  ) {
    alertByBudgetAuthorization()
    return false
  }
  return true
}
</script>

<template>
  <form @submit.prevent="save" class="form-card">
    <div class="form-section">
      <h3 class="form-section-title">Información de la actividad</h3>
      <div class="field-input">
        <label>ID Viaje del Cliente</label>
        <input v-model="activity.id_customer_trip" required type="number" />
      </div>
      <div class="field-input">
        <label>Tipo de Actividad</label>
        <select v-model="activity.id_activity_type" required>
          <option
            v-for="option in options.activityTypes"
            :key="option.id_activity_type"
            :value="option.id_activity_type"
          >
            {{ option.activity }}
          </option>
        </select>
      </div>
      <div class="field-input">
        <label>Responsable</label>
        <select v-model="activity.id_user" required>
          <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
            {{ option.first_name }} {{ option.last_name }}
          </option>
        </select>
      </div>
      <div class="field-input">
        <label>Fecha Estimada</label>
        <input v-model="activity.estimated_date" type="date" required />
      </div>
      <div class="field-input">
        <label>Presupuesto de Gasto</label>
        <FormattedNumberInput v-model="activity.budget" :required="true" />
      </div>
      <div class="field-input">
        <label>¿Completado?</label>
        <input
          v-model="activity.completed"
          type="checkbox"
          class="checkbox"
          @change="validateAuthorization()"
        />
      </div>
      <div v-if="activity.completed" class="field-input">
        <label>Fecha Completado</label>
        <input v-model="activity.execution_date" type="date" required />
      </div>
      <div v-if="activity.completed" class="field-input">
        <label>Valor Ejecutado</label>
        <FormattedNumberInput v-model="activity.execution_value" :required="true" />
      </div>
      <div class="field-input">
        <label>Comentario</label>
        <textarea v-model="activity.comment"></textarea>
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">
        {{ isEdit ? `Actualizar Actividad` : 'Crear Actividad' }}
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
