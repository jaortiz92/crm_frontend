<script setup>
import { defineProps, defineEmits, toRefs, ref, onMounted } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { customerTripService } from '@/services/customerTripService'
import { alertService } from '@/services/alertService'
import { useCustomerTripStore } from '@/stores/customerTripStore'
import FormattedNumberInput from '@/components/form/FormattedNumberInput.vue'

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
      paymentMethods: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { initialOrder, options, isEdit } = toRefs(props)

const order = ref({ ...initialOrder.value })
const details = ref(false)
const file = ref(null)

const new_values = ref({
  id_customer_trip: null,
  id_customer: null
})
const customersTrips = ref([])

const customerTripStore = useCustomerTripStore()

onMounted(async () => {
  if (
    !isEdit.value &&
    (customerTripStore.isThereCustomerTrip() || customerTripStore.isThereCustomer())
  ) {
    const storedTrip = customerTripStore.getCustomerTrip()
    if (storedTrip) {
      new_values.value.id_customer = storedTrip.id_customer

      if (customerTripStore.isThereCustomerTrip()) {
        new_values.value.id_customer_trip = storedTrip.id_customer_trip
        order.value.id_customer_trip = storedTrip.id_customer_trip
      }

      if (new_values.value.id_customer) {
        try {
          customersTrips.value = (
            await customerTripService.getCustomerTripsByCustomer(new_values.value.id_customer)
          ).data
        } catch (error) {
          console.error('Error loading customer trips from store:', error)
        }
      }
    }
    customerTripStore.clearCustomerTrip()
  }
})

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
  try {
    customersTrips.value = (
      await customerTripService.getCustomerTripsByCustomer(new_values.value.id_customer)
    ).data
  } catch (error) {
    console.error('Error loading customer trips:', error)
  }
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
  <form @submit.prevent="save" class="form-card">
    <div class="form-grid">
      <div class="form-column">
        <div class="form-section">
          <h3 class="form-section-title">Información de la orden</h3>
          <div v-if="!isEdit" class="field-input">
            <label>ID Orden</label>
            <FormattedNumberInput
              v-model="order.id_order"
              :min="1"
              :max="500000"
              :required="true"
            />
          </div>
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
                v-for="option in customersTrips"
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
            <input v-model="order.id_customer_trip" required type="number" />
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
        </div>

        <div class="form-section">
          <h3 class="form-section-title">Detalles del archivo</h3>
          <div class="field-input">
            <label>¿Agregar detalles? </label>
            <input v-model="details" type="checkbox" class="checkbox" />
          </div>
          <div v-if="details" class="field-input">
            <label>Marca:</label>
            <select v-model="order.type_format" required>
              <option key="1" value="kyly">Kyly</option>
              <option key="2" value="dame">Marcas de Dama</option>
              <option key="3" value="pampili">Pampili</option>
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

      <div class="form-column">
        <div class="form-section">
          <h3 class="form-section-title">Configuración de pago</h3>
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

        <div class="form-section">
          <h3 class="form-section-title">Cantidades y valores</h3>
          <div class="field-input">
            <label>Numero de prendas</label>
            <FormattedNumberInput
              v-model="order.total_quantities"
              :min="1"
              :max="500000"
              :required="true"
            />
          </div>
          <div class="field-input">
            <label>Numero de prendas Cargadas</label>
            <FormattedNumberInput
              v-model="order.system_quantities"
              :min="1"
              :max="500000"
              :required="true"
            />
          </div>
          <div class="field-input">
            <label>Valor sin IVA</label>
            <FormattedNumberInput @change="updateTotalValue" v-model="order.total_without_tax" />
          </div>
          <div class="field-input">
            <label>Valor Total</label>
            <FormattedNumberInput
              @change="updateWithoutTaxValue"
              v-model="order.total_with_tax"
              :min="50000"
              :max="500000000"
              :required="true"
            />
          </div>
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">
        {{ isEdit ? `Actualizar Orden` : 'Crear Orden' }}
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

  .form-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
</style>
