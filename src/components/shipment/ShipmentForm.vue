<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'

import { invoiceService } from '@/services/invoiceService'
import FormattedNumberInput from '@/components/form/FormattedNumberInput.vue'

const props = defineProps({
  initialShipment: {
    type: Object,
    default: () => basicModels.shipment
  },
  options: {
    type: Object,
    default: () => ({
      customers: [],
      users: [],
      invoices: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  },
  new_values: {
    type: Object,
    default: () => ({
      id_invoice: null,
      id_customer: null
    })
  }
})

const { initialShipment, options, isEdit, new_values } = toRefs(props)

const shipment = ref({ ...initialShipment.value })

const emit = defineEmits(['save'])
const save = () => {
  emit('save', shipment.value)
}

const updateInvoiceId = () => {
  shipment.value.id_invoice = new_values.value.id_invoice
}

const updateInvoice = async () => {
  options.value.invoices = (
    await invoiceService.getInvoiceByCustomer(new_values.value.id_customer)
  ).data
}
</script>

<template>
  <form @submit.prevent="save" class="form-card">
    <div class="form-section">
      <h3 class="form-section-title">Información del envío</h3>
      <div v-if="!isEdit" class="field-input">
        <label>Cliente</label>
        <select @change="updateInvoice" v-model="new_values.id_customer" required>
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
        <label>Factura</label>
        <select @change="updateInvoiceId" v-model="new_values.id_invoice" required>
          <option
            v-for="option in options.invoices"
            :key="option.id_invoice"
            :value="option.id_invoice"
          >
            {{ option.invoice_number }}-{{ option.key }} -> ID={{ option.id_invoice }}
          </option>
        </select>
      </div>

      <div class="field-input">
        <label>ID Factura</label>
        <input v-model="shipment.id_invoice" required type="number" />
      </div>
      <div class="field-input">
        <label>Fecha de envio</label>
        <input v-model="shipment.shipment_date" type="date" required />
      </div>
      <div class="field-input">
        <label>Transportadora</label>
        <input v-model="shipment.carrier" type="text" required />
      </div>
      <div class="field-input">
        <label>Numero de Guia</label>
        <input v-model="shipment.tracking_number" type="text" required />
      </div>
      <div class="field-input">
        <label>Fecha estimada de entrega</label>
        <input v-model="shipment.estimated_delivery_date" type="date" required />
      </div>
      <div class="field-input">
        <label>Valor Total</label>
        <FormattedNumberInput
          v-model="shipment.shipment_cost"
          :min="5000"
          :max="1000000"
          :required="true"
        />
      </div>
      <div class="field-input">
        <label>¿Recibido?</label>
        <input v-model="shipment.received" type="checkbox" class="checkbox" />
      </div>
      <div v-if="shipment.received" class="field-input">
        <label>Fecha Recibido</label>
        <input v-model="shipment.received_date" type="date" required />
      </div>
      <div class="field-input">
        <label>Comentario</label>
        <textarea v-model="shipment.details"></textarea>
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">
        {{ isEdit ? `Actualizar Envio` : 'Crear Envio' }}
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
