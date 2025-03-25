<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'

import { useUserStore } from '@/stores/userStore'

const props = defineProps({
  initialTask: {
    type: Object,
    default: () => basicModels.task
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

const userStore = useUserStore()
const { initialTask, options, isEdit } = toRefs(props)

const task = ref({ ...initialTask.value })

const isDisabledEdit = () => {
  if ((userStore.user.id_user !== task.value.id_creator) & isEdit.value) {
    return true
  }
  return false
}

const emit = defineEmits(['save'])
const save = () => {
  emit('save', task.value)
}
</script>

<template>
  <form @submit.prevent="save" class="form-task">
    <div class="field-input">
      <label>Cliente</label>
      <p class="company-name" v-if="isDisabledEdit() & isEdit">{{ task.customer.company_name }}</p>
      <select v-else v-model="task.id_customer" required :disabled="isDisabledEdit()">
        <option
          v-for="option in options.customers"
          :key="option.id_customer"
          :value="option.id_customer"
        >
          {{ option.company_name }}
        </option>
      </select>
    </div>
    <div class="field-input">
      <label>Responsable</label>
      <select v-model="task.id_responsible" required :disabled="isDisabledEdit()">
        <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
          {{ option.first_name }} {{ option.last_name }}
        </option>
      </select>
    </div>
    <div class="field-input">
      <label>Tarea</label>
      <textarea v-model="task.task" required :disabled="isDisabledEdit()"></textarea>
    </div>
    <div class="field-input">
      <label>¿Completado?</label>
      <input v-model="task.completed" type="checkbox" class="checkbox" />
    </div>
    <div v-if="task.completed" class="field-input">
      <label>Fecha Completado</label>
      <input v-model="task.execution_date" type="date" required />
    </div>
    <div class="field-input">
      <label>Comentario</label>
      <textarea v-model="task.comment"></textarea>
    </div>
    <button type="submit">{{ isEdit ? `Actualizar Tarea` : 'Crear Tarea' }}</button>
  </form>
</template>

<style scoped>
.form-task {
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
  .form-task {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
