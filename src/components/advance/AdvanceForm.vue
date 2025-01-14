<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  initialAdvance: {
    type: Object,
    default: () => basicModels.advance
  },
  order: {
    type: Object,
    default: () => basicModels.order
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { initialAdvance, order, isEdit } = toRefs(props)

const advance = ref({ ...initialAdvance.value })
advance.value.id_order = order.value.id_order
advance.value.advance_type_show = formatters.formattedPercentage(advance.value.advance_type)
const orderValue = ref(order.value.total_with_tax)

const emit = defineEmits(['save'])
const save = () => {
  emit('save', advance.value)
}

const onAmountChange = () => {
  if ((advance.value.amount <= orderValue.value) & (advance.value.amount > 0)) {
    if (advance.value.amount != null && orderValue.value > 0) {
      advance.value.advance_type = (advance.value.amount / orderValue.value).toFixed(4)
      advance.value.advance_type_show = formatters.formattedPercentage(advance.value.advance_type)
    }
  } else {
    advance.value.amount = orderValue.value
    advance.value.advance_type = 1
    advance.value.advance_type_show = formatters.formattedPercentage(advance.value.advance_type)
  }
}

const onAdvanceTypeChange = () => {
  const value = advance.value.advance_type_show.match(/[\d.]+/)[0]
  if ((value <= 100) & (value >= 0)) {
    advance.value.advance_type = value / 100
    if (advance.value.advance_type != null && orderValue.value > 0) {
      advance.value.amount = (advance.value.advance_type * orderValue.value).toFixed(0)
    }
  }

  advance.value.advance_type_show = formatters.formattedPercentage(advance.value.advance_type)
}

const onPaymentChange = () => {
  if (advance.value.payment > advance.value.amount) {
    advance.value.payment = 0
  }
}
</script>

<template>
  <form @submit.prevent="save" class="form-advance">
    <div v-if="!isEdit" class="field-input">
      <label>ID Orden</label>
      <input v-model="advance.id_order" required type="number" />
    </div>
    <div class="field-input">
      <label>Fecha de Vencimiento</label>
      <input v-model="advance.payment_date" type="date" required />
    </div>
    <div class="field-input">
      <label>%Anticipo</label>
      <input v-model="advance.advance_type_show" @change="onAdvanceTypeChange" required />
    </div>
    <div class="field-input">
      <label>Valor Anticipo</label>
      <input v-model="advance.amount" type="number" @change="onAmountChange" required />
    </div>
    <div class="field-input">
      <label>Valor Pago</label>
      <input v-model="advance.payment" type="number" min="0" required @change="onPaymentChange" />
    </div>
    <div v-if="advance.payment > 0" class="field-input">
      <label>Fecha de Ultimo pago</label>
      <input v-model="advance.payment_date" type="date" required />
    </div>
    <button type="submit">{{ isEdit ? `Actualizar Anticipo` : 'Crear Anticipo' }}</button>
  </form>
</template>

<style scoped>
.form-advance {
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

@media (max-width: 480px) {
  .form-advance {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
