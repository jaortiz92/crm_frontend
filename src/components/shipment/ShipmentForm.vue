<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { formatters } from '@/plugins/formatters'

import { invoiceService } from '@/services/invoiceService'

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
  <form @submit.prevent="save" class="form-shipment">
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
      <div class="input-number">
        <input
          @change="updateWithoutTaxValue"
          v-model="shipment.shipment_cost"
          orderStore
          type="number"
          min="5000"
          max="1000000"
          required
        />
        <p>{{ formatters.formatterGeneralNumber(shipment.shipment_cost) }}</p>
      </div>
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
    <button type="submit">{{ isEdit ? `Actualizar Envio` : 'Crear Envio' }}</button>
  </form>
</template>

<style scoped>
.form-shipment {
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
  .form-shipment {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
