<script setup>
import { defineProps, defineEmits, toRefs } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { formatters } from '@/plugins/formatters'

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
  <form @submit.prevent="authorizeActivity" class="form-activity">
    <div class="field-input">
      <label>¿Autorizadó?</label>
      <input v-model="activity.authorized" type="checkbox" class="checkbox" />
    </div>
    <div v-if="activity.authorized" class="field-input">
      <label>Valor Autorizadó</label>
      <div class="input-number">
        <input v-model="activity.budget_authorized" type="number" required />
        <p>{{ formatters.formatterGeneralNumber(activity.budget_authorized) }}</p>
      </div>
    </div>
    <button type="submit">Autorizar</button>
  </form>
</template>

<style scoped>
.form-activity {
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

.input-value {
  display: flex;
}

@media (max-width: 480px) {
  .form-activity {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
