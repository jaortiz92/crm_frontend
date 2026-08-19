<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import FormattedNumberInput from '@/components/form/FormattedNumberInput.vue'

const props = defineProps({
  initialCustomerTrip: {
    type: Object,
    default: () => basicModels.customerTrip
  },
  options: {
    type: Object,
    default: () => ({
      customers: [],
      users: [],
      collections: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { initialCustomerTrip, isEdit } = toRefs(props)

const customerTrip = ref({ ...initialCustomerTrip.value })

const updateBudget = () => {
  if (!customerTrip.value.with_budget) {
    customerTrip.value.budget = 0
    customerTrip.value.budget_quantities = 0
  }
}

const emit = defineEmits(['save'])
const save = () => {
  emit('save', customerTrip.value)
}
</script>

<template>
  <form @submit.prevent="save" class="form-card">
    <div class="form-grid">
      <div class="form-column">
        <div class="form-section">
          <h3 class="form-section-title">Información del viaje</h3>
          <div class="field-input">
            <label>Cliente</label>
            <select v-model="customerTrip.id_customer" required>
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
            <label>Vendedor</label>
            <select v-model="customerTrip.id_seller" required>
              <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
                {{ option.first_name }} {{ option.last_name }}
              </option>
            </select>
          </div>
          <div class="field-input">
            <label>Colección</label>
            <select v-model="customerTrip.id_collection" required>
              <option
                v-for="option in options.collections"
                :key="option.id_collection"
                :value="option.id_collection"
              >
                {{ option.short_collection_name }} - {{ option.collection_name }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-section">
          <h3 class="form-section-title">Configuración</h3>
          <div class="field-input">
            <label>¿Con Presupuesto? </label>
            <input
              @change="updateBudget"
              v-model="customerTrip.with_budget"
              type="checkbox"
              class="checkbox"
            />
          </div>

          <div v-if="customerTrip.with_budget" class="field-input">
            <label>Presupuesto Valor</label>
            <FormattedNumberInput
              v-model="customerTrip.budget"
              :min="500000"
              :max="500000000"
              :required="true"
            />
          </div>
          <div v-if="customerTrip.with_budget" class="field-input">
            <label>Presupuesto Prendas</label>
            <FormattedNumberInput
              v-model="customerTrip.budget_quantities"
              :min="1"
              :max="500000"
              :required="true"
            />
          </div>
          <div class="field-input">
            <label>¿Viaje Cerrado? </label>
            <input v-model="customerTrip.closed" type="checkbox" class="checkbox" />
          </div>
        </div>
      </div>

      <div class="form-column">
        <div class="form-section">
          <h3 class="form-section-title">Comentarios</h3>
          <div class="field-input">
            <label>Comentario</label>
            <textarea v-model="customerTrip.comment"></textarea>
          </div>
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">
        {{ isEdit ? `Actualizar Viaje del cliente` : 'Crear Viaje del cliente' }}
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

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

.form-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
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
  min-height: 120px;
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

  .form-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
</style>
