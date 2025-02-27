<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { formatters } from '@/plugins/formatters'
import { customerTripService } from '@/services/customerTripService'
import { alertService } from '@/services/alertService'

const props = defineProps({
  initialOrder: {
    type: Object,
    default: () => basicModels.order
  },
  options: {
    type: Object,
    default: () => ({
      customers: [],
      users: [],
      paymentMethods: [],
      customersTrips: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  },
  new_values: {
    type: Object,
    default: () => ({
      id_customer_trip: null,
      id_customer: null
    })
  }
})

const { initialOrder, options, isEdit, new_values } = toRefs(props)

const order = ref({ ...initialOrder.value })
const details = ref(false)
const file = ref(null)

const emit = defineEmits(['save'])
const save = () => {
  emit('save', order.value, file.value)
}

const updateTotalValue = () => {
  order.value.total_with_tax = Math.round(order.value.total_without_tax * 1.19, 0)
}

const updateWithoutTaxValue = () => {
  order.value.total_without_tax = Math.round(order.value.total_with_tax / 1.19, 0)
}

const updateCustomerTrip = async () => {
  options.value.customersTrips = (
    await customerTripService.getCustomerTripsByCustomer(new_values.value.id_customer)
  ).data
}

const updateCustomerTripId = () => {
  order.value.id_customer_trip = new_values.value.id_customer_trip
}

const handleFileUpload = (event) => {
  file.value = event.target.files[0]

  const validTypes = ['xlsx', 'xlsm']
  const extension = file.value.name.split('.').pop().toLowerCase()

  if (!validTypes.includes(extension)) {
    alertService.generalError('Solo se permiten archivos xlsx o xlsm')
    file.value = null
  }
}
</script>

<template>
  <form @submit.prevent="save" class="form-order">
    <div class="fields">
      <div class="detail-column">
        <div v-if="!isEdit" class="field-input">
          <label>Cliente</label>
          <select @change="updateCustomerTrip" v-model="new_values.id_customer" required>
            <option
              v-for="option in options.customers"
              :key="option.id_customer"
              :value="option.id_customer"
            >
              {{ option.company_name }}
            </option>
          </select>
        </div>
        <div v-if="!isEdit" class="field-input">
          <label>Viaje del Cliente</label>
          <select @change="updateCustomerTripId" v-model="new_values.id_customer_trip" required>
            <option
              v-for="option in options.customersTrips"
              :key="option.id_customer_trip"
              :value="option.id_customer_trip"
            >
              {{ option.collection.line.line_name }}-{{
                option.collection.short_collection_name
              }}
              -> ID={{ option.id_customer_trip }}
            </option>
          </select>
        </div>

        <div class="field-input">
          <label>ID Viaje del Cliente</label>
          <input v-model="order.id_customer_trip" required orderStore type="number" />
        </div>
        <div class="field-input">
          <label>Vendedor</label>
          <select v-model="order.id_seller" required>
            <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
              {{ option.first_name }} {{ option.last_name }}
            </option>
          </select>
        </div>
        <div class="field-input">
          <label>Fecha</label>
          <input v-model="order.date_order" type="date" required />
        </div>
        <div class="field-input">
          <label>Fecha estimada de entrega</label>
          <input v-model="order.delivery_date" type="date" required />
        </div>
        <div class="field-input">
          <label>Forma de pago</label>
          <select v-model="order.id_payment_method" required>
            <option
              v-for="option in options.paymentMethods"
              :key="option.id_payment_method"
              :value="option.id_payment_method"
            >
              {{ option.payment_method_name }}
            </option>
          </select>
        </div>
      </div>
      <div class="detail-column">
        <div class="field-input">
          <label>Cantidad de prendas</label>
          <div class="input-number">
            <input v-model="order.total_quantities" required orderStore type="number" />
            <p>{{ formatters.formatterGeneralNumber(order.total_quantities) }}</p>
          </div>
        </div>
        <div class="field-input">
          <label>Cantidades en sistema</label>
          <div class="input-number">
            <input v-model="order.system_quantities" required orderStore type="number" />
            <p>{{ formatters.formatterGeneralNumber(order.system_quantities) }}</p>
          </div>
        </div>
        <div class="field-input">
          <label>Valor sin IVA</label>
          <div class="input-number">
            <input
              @change="updateTotalValue"
              v-model="order.total_without_tax"
              required
              orderStore
              type="number"
            />
            <p>{{ formatters.formatterGeneralNumber(order.total_without_tax) }}</p>
          </div>
        </div>
        <div class="field-input">
          <label>Valor Total</label>
          <div class="input-number">
            <input
              @change="updateWithoutTaxValue"
              v-model="order.total_with_tax"
              required
              orderStore
              type="number"
            />
            <p>{{ formatters.formatterGeneralNumber(order.total_with_tax) }}</p>
          </div>
        </div>
        <div class="field-input">
          <label>¿Agregar detalles? </label
          ><input v-model="details" type="checkbox" class="checkbox" />
        </div>
        <div v-if="details" class="field-input">
          <label>Marca:</label>
          <select v-model="order.type_format" required>
            <option key="1" value="child">Kyly</option>
            <option key="2" value="dame">Givec o Tinta</option>
          </select>
          <label for="document">Documento:</label>
          <input
            type="file"
            id="document"
            @change="handleFileUpload"
            accept=".xlsx,.xlsm"
            required
          />
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit">{{ isEdit ? `Actualizar Orden` : 'Crear Orden' }}</button>
    </div>
  </form>
</template>

<style scoped>
.form-order {
  max-width: 800px;
  margin: 0 auto;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  box-shadow: 0 4px 8px var(--shadow);
}

.fields {
  display: flex;
}

.detail-column {
  flex: 1 1 45%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.checkbox {
  width: auto;
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
  .form-order {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
