<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  activity: Object
})
const { activity } = toRefs(props)
</script>

<template>
  <div class="template-container">
    <h2>ID Actividad {{ activity.id_activity }}</h2>
    <div class="details-wrapper">
      <div class="detail-column">
        <div class="detail-row">
          <p><strong>Cliente:</strong></p>
          <router-link
            :to="{
              name: 'CustomerDetail',
              params: { id: activity.customer_trip.id_customer }
            }"
          >
            <p>{{ activity.customer_trip.customer.company_name }}</p>
          </router-link>
        </div>
        <div class="detail-row">
          <p><strong>ID Viaje del cliente:</strong></p>
          <router-link
            :to="{
              name: 'CustomerTripDetail',
              params: { id: activity.id_customer_trip }
            }"
          >
            <p>{{ activity.id_customer_trip }}</p>
          </router-link>
        </div>
        <div class="detail-row">
          <p><strong>Colección:</strong></p>
          <p>
            {{ activity.customer_trip.collection.short_collection_name }} - Q{{
              activity.customer_trip.collection.quarter
            }}
            {{ activity.customer_trip.collection.year }}
          </p>
        </div>

        <div class="detail-row">
          <p><strong>Ciudad:</strong></p>
          <p>{{ activity.customer_trip.customer.city.city_name }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Asesor:</strong>
          </p>
          <p>
            {{ activity.customer_trip.seller.first_name }}
            {{ activity.customer_trip.seller.last_name }}
          </p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Responsable:</strong>
          </p>
          <p>{{ activity.user_activities.first_name }} {{ activity.user_activities.last_name }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Fecha Creación:</strong></p>
          <p>{{ activity.creation_date }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Fecha Estimada:</strong>
          </p>
          <p>{{ activity.estimated_date }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Fecha Ejecución:</strong>
          </p>
          <p v-if="activity.execution_date">{{ activity.execution_date }}</p>
          <p v-else>Sin Completar</p>
        </div>
      </div>
      <div class="detail-column">
        <div class="detail-row">
          <p>
            <strong>Presupuesto de Gasto:</strong>
          </p>
          <p>{{ formatters.formatterGeneralNumber(activity.budget) }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Completado:</strong></p>
          <p>
            <span :class="{ checkbox: true, checked: activity.completed }"></span>
          </p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Valor Ejecutado:</strong>
          </p>
          <p>{{ formatters.formatterGeneralNumber(activity.execution_value) }}</p>
        </div>
        <div class="detail-row authorization-row">
          <p>
            <strong>¿Necesita autorización?:</strong>
          </p>
          <p>
            <strong>{{ activity.budget > 0 ? 'Si' : 'No' }}</strong>
          </p>
        </div>
        <div class="detail-row">
          <p><strong>Autorizadó:</strong></p>
          <p>
            <span :class="{ checkbox: true, checked: activity.authorized }"></span>
          </p>
        </div>
        <div class="detail-row">
          <p><strong>Autorizador:</strong></p>
          <p v-if="activity.authorizer_activities">
            {{ activity.authorizer_activities.first_name }}
            {{ activity.authorizer_activities.last_name }}
          </p>
          <p v-else>{{ activity.budget > 0 ? 'Sin autorizar' : 'No necesario' }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Fecha Autorizadó:</strong></p>
          <p v-if="activity.authorizer_activities">
            {{ activity.date_authorized }}
          </p>
          <p v-else>{{ activity.budget > 0 ? 'Sin autorizar' : 'No necesario' }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Valor Autorizadó:</strong>
          </p>
          <p>{{ formatters.formatterGeneralNumber(activity.budget_authorized) }}</p>
        </div>
      </div>
    </div>
    <div class="text-row">
      <div class="detail-column">
        <p><strong>Actividad:</strong></p>
        <p class="space-for-text">{{ activity.activity_type.activity }}</p>
      </div>
      <div class="detail-column">
        <p>
          <strong>Comentarios:</strong>
        </p>
        <p class="space-for-text" v-if="activity.comment">{{ activity.comment }}</p>
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

.authorization-row {
  border-top: 1px solid var(--gray-border);
}

.comment-row {
  border-top: 1px solid var(--gray-border);
  margin-top: 15px;
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
