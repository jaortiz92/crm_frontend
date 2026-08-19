<script setup>
import { defineProps, defineEmits, toRefs } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { formatters } from '@/plugins/formatters'
import FormattedNumberInput from '@/components/form/FormattedNumberInput.vue'

const props = defineProps({
  activity: {
    type: Object,
    default: () => basicModels.activity
  }
})

const { activity } = toRefs(props)

const emit = defineEmits(['authorizeActivity'])
const authorizeActivity = () => {
  if (activity.value.authorized) {
    emit('authorizeActivity', activity.value)
  }
}
</script>

<template>
  <form @submit.prevent="authorizeActivity" class="form-card">
    <div class="form-section">
      <h3 class="form-section-title">Autorización</h3>
      <div class="field-input">
        <label>¿Autorizado?</label>
        <input v-model="activity.authorized" type="checkbox" class="checkbox" />
      </div>
      <div v-if="activity.authorized" class="field-input">
        <label>Valor Autorizado</label>
        <FormattedNumberInput v-model="activity.budget_authorized" :required="true" />
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">Autorizar</button>
    </div>
  </form>
</template>

<style scoped>
.form-card {
  width: 85%;
  max-width: 600px;
  margin: 0 auto;
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

.field-input input {
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

.field-input input:focus {
  outline: none;
  border-color: var(--color-brand, #03658c);
}

.field-input .checkbox {
  width: auto;
  margin: 0;
}

.field-hint {
  font-size: 12px;
  color: var(--color-text-secondary, #616161);
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
