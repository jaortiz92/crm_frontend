<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  user: Object
})
const { user } = toRefs(props)
</script>

<template>
  <h2>{{ user.username }}</h2>
  <div class="detail-row">
    <p><strong>Nombres:</strong></p>
    <p>{{ user.first_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Apellidos:</strong></p>
    <p>{{ user.last_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Documento:</strong></p>
    <p>{{ user.document }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Cargo:</strong></p>
    <p>{{ user.role.role_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Correo:</strong></p>
    <p>{{ user.email }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Celular(Telefono):</strong></p>
    <p>{{ formatters.formatterPhoneNumber(user.phone) }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Genero:</strong></p>
    <p>{{ formatters.formatterGender(user.gender) }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Departamento:</strong></p>
    <p>{{ user.city.department.department_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Fecha Nacimiento:</strong></p>
    <p>{{ user.birth_date }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Ciudad:</strong></p>
    <p>{{ user.city.city_name }}</p>
  </div>
  <div class="detail-row">
    <p>
      <strong>Activo:</strong>
    </p>
    <p>
      <span :class="{ checkbox: true, checked: user.active }"></span>
    </p>
  </div>
</template>

<style scoped>
.detail-row {
  display: flex;
  margin: 1%;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid var(--gray-border);
}

.detail-row p {
  font-size: 100%;
  margin: 3px;
}

.detail-row:last-child {
  border-bottom: none;
}

@media (max-width: 600px) {
  .detail-row {
    flex-direction: column;
    text-align: left;
  }

  .detail-row p:last-child {
    text-align: left;
    margin-top: 5px;
  }
}

.checkbox {
  margin: 0;
}

.rating-detail:hover {
  cursor: pointer;
}

.space-for-text {
  text-align: justify;
  white-space: pre-wrap;
  margin: 1px;
}

.detail-column {
  flex: 1 1 45%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
</style>
