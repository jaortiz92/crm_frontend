<script setup>
import { ref, watch } from 'vue'
import { formatters } from '@/plugins/formatters'

const props = defineProps({
  modelValue: { type: [Number, String], default: null },
  placeholder: { type: String, default: '' },
  required: { type: Boolean, default: false },
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined },
  format: { type: String, default: 'number', validator: (v) => ['number', 'phone'].includes(v) }
})

const emit = defineEmits(['update:modelValue'])

const displayValue = ref('')
const isFocused = ref(false)

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return ''
  if (props.format === 'phone') {
    return formatters.formatterPhoneNumber(value)
  }
  if (typeof value === 'number') {
    return formatters.formatterGeneralNumber(value)
  }
  return value
}

const parseNumber = (str) => {
  if (!str) return null
  const cleaned = str.replace(/[^0-9]/g, '')
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? null : num
}

const handleFocus = () => {
  isFocused.value = true
  displayValue.value =
    props.modelValue !== null && props.modelValue !== undefined ? props.modelValue.toString() : ''
}

const handleBlur = () => {
  isFocused.value = false
  const num = parseNumber(displayValue.value)

  if (num === null) {
    emit('update:modelValue', null)
    displayValue.value = ''
    return
  }

  let validated = num
  if (props.min !== undefined && validated < props.min) validated = null
  if (props.max !== undefined && validated > props.max) validated = null

  emit('update:modelValue', validated)
  displayValue.value = formatValue(validated)
}

const handleInput = (event) => {
  const raw = event.target.value.replace(/[^0-9]/g, '')
  displayValue.value = raw
  const num = parseNumber(raw)
  emit('update:modelValue', num)
}

watch(
  () => props.modelValue,
  (val) => {
    if (!isFocused.value) {
      displayValue.value = formatValue(val)
    }
  },
  { immediate: true }
)
</script>

<template>
  <input
    type="text"
    inputmode="numeric"
    v-model="displayValue"
    @focus="handleFocus"
    @blur="handleBlur"
    @input="handleInput"
    :placeholder="placeholder"
    :required="required"
  />
</template>
