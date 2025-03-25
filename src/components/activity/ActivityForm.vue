<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'
import { formatters } from '@/plugins/formatters'

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
    ((activity.value.completed & (activity.value.budget > 0)) |
      (activity.value.completed & (activity.value.execution_value > 0))) &
    !activity.value.authorized
  ) {
    activity.value.completed = false
    activity.value.execution_value = 0

    alertByAuthorization()
    return false
  } else if (
    activity.value.completed &
    (activity.value.execution_value > activity.value.budget_authorized)
  ) {
    alertByBudgetAuthorization()
    return false
  }
  return true
}
</script>

<template>
  <form @submit.prevent="save" class="form-activity">
    <div class="field-input">
      <label>ID Viaje del Cliente</label>
      <input v-model="activity.id_customer_trip" required activityStore type="number" />
    </div>
    <div class="field-input">
      <label>Tipo de Actividad</label>
      <select v-model="activity.id_activity_type" required activityStore>
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
      <select v-model="activity.id_user" required activityStore>
        <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
          {{ option.first_name }} {{ option.last_name }}
        </option>
      </select>
    </div>
    <div class="field-input">
      <label>Fecha Estimada</label>
      <input v-model="activity.estimated_date" type="date" required />
    </div>
    <div class="field-number">
      <label>Presupuesto de Gasto</label>
      <div class="input-number">
        <input v-model="activity.budget" type="number" required />
        <p>{{ formatters.formatterGeneralNumber(activity.budget) }}</p>
      </div>
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
      <div class="input-number">
        <input v-model="activity.execution_value" type="number" required />
        <p>{{ formatters.formatterGeneralNumber(activity.execution_value) }}</p>
      </div>
    </div>
    <div class="field-input">
      <label>Comentario</label>
      <textarea v-model="activity.comment"></textarea>
    </div>
    <button type="submit">{{ isEdit ? `Actualizar Actividad` : 'Crear Actividad' }}</button>
  </form>
</template>

<style scoped>
.form-activity {
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
  .form-activity {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
