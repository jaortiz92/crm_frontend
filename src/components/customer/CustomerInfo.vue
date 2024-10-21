<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  customer: Object
})
const { customer } = toRefs(props)
</script>

<template>
  <h2>{{ customer.company_name }}</h2>
  <div class="detail-row">
    <p><strong>Documento:</strong></p>
    <p>{{ customer.document }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Correo:</strong></p>
    <p>{{ customer.email }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Telefono:</strong></p>
    <p>{{ formatters.formatterPhoneNumber(customer.phone) }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Dirección:</strong></p>
    <p>{{ customer.address }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Tiendas:</strong></p>
    <p>{{ customer.stores }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Tipo de tienda:</strong></p>
    <p>{{ customer.store_type.store_type }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Marca:</strong></p>
    <p>{{ customer.brand.brand_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Linea:</strong></p>
    <p>{{ customer.brand.line.line_name }}</p>
  </div>
  <div class="detail-row">
    <p>
      <strong>Vendedor:</strong>
    </p>
    <p>
      {{ customer.seller.first_name }}
      {{ customer.seller.last_name }}
    </p>
  </div>
  <div class="detail-row">
    <p><strong>Departamento:</strong></p>
    <p>{{ customer.city.department.department_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Ciudad:</strong></p>
    <p>{{ customer.city.city_name }}</p>
  </div>
  <div class="detail-row">
    <p>
      <strong>Activo:</strong>
    </p>
    <p>
      <span :class="{ checkbox: true, checked: customer.active }"></span>
    </p>
  </div>
</template>

<style scoped>
h2 {
  text-align: center;
  font-size: 150%;
  margin-top: 10px;
}

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
</style>
