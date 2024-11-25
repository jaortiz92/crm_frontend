<script setup>
import { toRefs } from 'vue'

const props = defineProps({
  task: Object
})
const { task } = toRefs(props)
</script>

<template>
  <div class="template-container">
    <h2>ID Tarea {{ task.id_task }}</h2>
    <div class="details-wrapper">
      <div class="detail-column">
        <div class="detail-row">
          <p><strong>Cliente:</strong></p>
          <router-link
            :to="{
              name: 'CustomerDetail',
              params: { id: task.id_customer }
            }"
          >
            <p>{{ task.customer.company_name }}</p>
          </router-link>
        </div>
        <div class="detail-row">
          <p><strong>Ciudad:</strong></p>
          <p>{{ task.customer.city.city_name }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Creador de la tarea:</strong>
          </p>
          <p>
            {{ task.creator_tasks.first_name }}
            {{ task.creator_tasks.last_name }}
          </p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Responsable de la tarea:</strong>
          </p>
          <p>{{ task.responsible_task.first_name }} {{ task.responsible_task.last_name }}</p>
        </div>
      </div>
      <div class="detail-column">
        <div class="detail-row">
          <p><strong>Fecha Creación:</strong></p>
          <p>{{ task.creation_date }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Fecha Ejecución:</strong>
          </p>
          <p v-if="task.execution_date">{{ task.execution_date }}</p>
          <p v-else>Sin Completar</p>
        </div>
        <div class="detail-row">
          <p><strong>Completado:</strong></p>
          <p>
            <span :class="{ checkbox: true, checked: task.completed }"></span>
          </p>
        </div>
      </div>
    </div>
    <div class="text-row">
      <div class="detail-column">
        <p><strong>Tarea:</strong></p>
        <p class="space-for-text">{{ task.task }}</p>
      </div>
      <div class="detail-column">
        <p>
          <strong>Comentarios:</strong>
        </p>
        <p class="space-for-text" v-if="task.comment">{{ task.comment }}</p>
        <p class="space-for-text" v-else>Sin Comentarios</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-container {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  padding: 20px;
  max-width: 100%;
  background-color: var(--background-light);
}

.details-wrapper {
  display: flex;
  flex-wrap: wrap;
}

.detail-column {
  flex: 1 1 45%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-column:first-child {
  border-right: 1px solid var(--gray-border);
  padding-right: 15px;
  margin-right: 15px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
}

.detail-row p {
  margin: 0;
  font-size: 1rem;
}

.detail-row p:first-child {
  font-weight: bold;
}

.detail-row p:last-child {
  text-align: right;
}

.text-row {
  display: flex;
  flex-wrap: wrap;
  border-top: 1px solid var(--gray-border);
  margin-top: 15px;
  padding-top: 15px;
}
.space-for-text {
  text-align: justify;
}
</style>
