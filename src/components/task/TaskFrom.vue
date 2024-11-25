<template>
  <form @submit.prevent="save" class="form-task">
    <div class="field-input">
      <label>Cliente</label>
      <select v-model="task.id_customer">
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
      <select v-model="task.id_responsible">
        <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
          {{ option.first_name }} {{ option.last_name }}
        </option>
      </select>
    </div>
    <div class="field-input">
      <label>Tarea</label>
      <textarea v-model="task.task"></textarea>
    </div>
    <div class="field-input">
      <label>¿Completado?</label>
      <input v-model="task.completed" type="checkbox" />
    </div>
    <div v-if="task.completed" class="field-input">
      <label>Fecha Completado</label>
      <input v-model="task.execution_date" type="date" />
    </div>
    <div class="field-input">
      <label>Comentario</label>
      <textarea v-model="task.comment"></textarea>
    </div>
    <button type="submit">Guardar</button>
  </form>
</template>

<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
const props = defineProps({
  initialTask: {
    type: Object,
    default: () => ({
      id_customer: null,
      id_responsible: null,
      id_creator: null,
      creation_date: null,
      task: null,
      completed: false,
      execution_date: null,
      comment: null
    })
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

const { initialTask, isEdit, options } = toRefs(props)

const task = ref({ ...initialTask.value })

const emit = defineEmits(['save'])

const save = () => {
  emit('save', task)
}
</script>

<style></style>
