<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { formatters } from '@/plugins/formatters'

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
  <form @submit.prevent="save" class="form-customerTrip">
    <div class="fields">
      <div class="detail-column">
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
      <div class="detail-column">
        <div class="field-input">
          <label>¿Con Presupuesto? </label
          ><input
            @change="updateBudget"
            v-model="customerTrip.with_budget"
            type="checkbox"
            class="checkbox"
          />
        </div>

        <div v-if="customerTrip.with_budget" class="field-input">
          <label>Presupuesto Valor</label>
          <div class="input-number">
            <input
              v-model="customerTrip.budget"
              type="number"
              min="500000"
              max="500000000"
              required
            />
            <p>{{ formatters.formatterGeneralNumber(customerTrip.budget) }}</p>
          </div>
        </div>
        <div v-if="customerTrip.with_budget" class="field-input">
          <label>Presupuesto Prendas</label>
          <div class="input-number">
            <input
              v-model="customerTrip.budget_quantities"
              type="number"
              min="1"
              max="500000"
              required
            />
            <p>{{ formatters.formatterGeneralNumber(customerTrip.budget_quantities) }}</p>
          </div>
        </div>
        <div class="field-input">
          <label>¿Viaje Cerrado? </label
          ><input v-model="customerTrip.closed" type="checkbox" class="checkbox" />
        </div>
        <div class="field-input">
          <label>Comentario</label>
          <textarea v-model="customerTrip.comment"></textarea>
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit">
        {{ isEdit ? `Actualizar Viaje del cliente` : 'Crear Viaje del cliente' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.form-customerTrip {
  max-width: 800px;
  margin: 0 auto;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  box-shadow: 0 4px 8px var(--shadow);
}

.company-name {
  text-align: left;
  margin: 5px;
  padding: 5px;
  border: 1px solid var(--gray-border);
  color: var(--gray-border);
}

.button-group {
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
}

button {
  min-width: 150px;
}

@media (max-width: 480px) {
  .form-customerTrip {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
