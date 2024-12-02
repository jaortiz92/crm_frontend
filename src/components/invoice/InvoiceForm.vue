<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { formatters } from '@/plugins/formatters'
import { alertService } from '@/services/alertService'

const props = defineProps({
  initialInvoice: {
    type: Object,
    default: () => basicModels.invoice
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

const { initialInvoice, isEdit } = toRefs(props)

const invoice = ref({ ...initialInvoice.value })

const emit = defineEmits(['save'])
const save = () => {
  const validationNumber = formatters.validateFormatterInvoice(invoice.value.invoice_number)
  if (validationNumber) {
    invoice.value.invoice_number = validationNumber
    emit('save', invoice.value)
  } else {
    alertService.generalError(
      'Error al ingresar el numero de factura: Formatos validos "FVFE99-DCM99-NDCL99-NDDL99"'
    )
  }
}

const addDetail = () => {
  alert(1)
}
</script>

<template>
  <form @submit.prevent="save" class="form-invoice">
    <div class="fields">
      <div class="detail-column">
        <div class="field-input">
          <label>Numero De Factura</label>
          <input v-model="invoice.invoice_number" required invoiceStore type="text" />
        </div>
        <div class="field-input">
          <label>Llave</label>
          <select v-model="invoice.key" required>
            <option v-for="index in 10" :key="index" :value="index">
              {{ index }}
            </option>
          </select>
        </div>
      </div>
      <div class="detail-column">
        <div class="field-input">
          <label>Fecha</label>
          <input v-model="invoice.invoice_date" type="date" required />
        </div>
        <div class="field-input">
          <label>ID order</label>
          <input v-model="invoice.id_order" required invoiceStore type="number" />
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit">{{ isEdit ? `Actualizar Factura` : 'Crear Factura' }}</button>
      <button @click="addDetail">Agregar Detalles</button>
    </div>
  </form>
</template>

<style scoped>
.form-invoice {
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
  .form-invoice {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
