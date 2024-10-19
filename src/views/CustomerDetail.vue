<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { customerService } from '@/services/customerService'

const route = useRoute()
const customer = ref(null)

onMounted(async () => {
  const idCustomer = route.params.id
  customer.value = (await customerService.getCustomerFull(idCustomer)).data
})
</script>

<template>
  <div class="customer-detail" v-if="customer">
    <h2>{{ customer.company_name }}</h2>
    <p class="detail-row"><strong>Documento:</strong> {{ customer.document }}</p>
    <p class="detail-row"><strong>Correo:</strong> {{ customer.email }}</p>
    <p class="detail-row"><strong>Telefono:</strong> {{ customer.phone }}</p>
    <p class="detail-row"><strong>Dirección:</strong> {{ customer.address }}</p>
    <p class="detail-row"><strong>Tiendas:</strong> {{ customer.stores }}</p>
    <p class="detail-row"><strong>Tipo de tienda:</strong> {{ customer.store_type.store_type }}</p>
    <p class="detail-row"><strong>Marca:</strong> {{ customer.brand.brand_name }}</p>
    <p class="detail-row"><strong>Linea:</strong> {{ customer.brand.line.line_name }}</p>
    <p class="detail-row">
      <strong>Vendedor:</strong> {{ customer.seller.first_name }} {{ customer.seller.last_name }}
    </p>
    <p class="detail-row">
      <strong>Departamento:</strong> {{ customer.city.department.department_name }}
    </p>
    <p class="detail-row"><strong>Ciudad:</strong> {{ customer.city.city_name }}</p>
    <p class="detail-row">
      <strong>Activo:</strong> <span :class="{ checkbox: true, checked: customer.active }"></span>
    </p>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.customer-detail {
  max-width: 600px;
  margin: 0 auto;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: 8px;
  box-shadow: 0 2px 10px var(--shadow);
}

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
}

.detail-row:last-child {
  border-bottom: none;
}

/* Mobile responsiveness */
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
