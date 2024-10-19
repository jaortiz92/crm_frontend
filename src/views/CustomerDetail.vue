<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { customerService } from '@/services/customerService'
import ContactTable from '@/components/customer/contact/ContactTable.vue'

const route = useRoute()
const customer = ref(null)
const contacts = ref([])

onMounted(async () => {
  const idCustomer = route.params.id
  customer.value = (await customerService.getCustomerFull(idCustomer)).data
  contacts.value = (await customerService.getContactsByCustomer(idCustomer)).data
})
</script>

<template>
  <div class="customer" v-if="customer">
    <div class="customer-detail">
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
        <p>{{ customer.phone }}</p>
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
    </div>
    <div class="contacts">
      <h2>Contactos</h2>
      <ContactTable :contacts="contacts"></ContactTable>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.customer {
  display: flex;
}
.customer-detail {
  max-width: 600px;
  min-width: 500px;
  margin: 10px;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: var(--border-radius-size);
  box-shadow: 0 2px 10px var(--shadow);
}

.contacts {
  flex-grow: 1;
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
