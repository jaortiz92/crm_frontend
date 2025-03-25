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
const details = ref(false)
const file = ref(null)

const emit = defineEmits(['save'])
const save = () => {
  const validationNumber = formatters.validateFormatterInvoice(invoice.value.invoice_number)
  if (validationNumber) {
    invoice.value.invoice_number = validationNumber
    emit('save', invoice.value, file.value)
  } else {
    alertService.generalError(
      'Error al ingresar el numero de factura: Formatos validos "FVFE99-DCM99-NDCL99-NDDL99"'
    )
  }
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
            <option v-for="index in 3" :key="index" :value="index">
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
        <div class="field-input">
          <label>¿Agregar detalles? </label
          ><input v-model="details" type="checkbox" class="checkbox" />
        </div>
        <div v-if="details" class="field-input">
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
      <button type="submit">{{ isEdit ? `Actualizar Factura` : 'Crear Factura' }}</button>
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
