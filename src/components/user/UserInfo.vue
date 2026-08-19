<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  user: Object
})
const { user } = toRefs(props)
</script>

<template>
  <div class="detail-card">
    <h1 class="user-name">{{ user.username }}</h1>

    <dl class="detail-grid">
      <div class="detail-group">
        <dt>Nombres:</dt>
        <dd>{{ user.first_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Apellidos:</dt>
        <dd>{{ user.last_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Documento:</dt>
        <dd>{{ user.document }}</dd>
      </div>

      <div class="detail-group">
        <dt>Cargo:</dt>
        <dd>{{ user.role.role_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Correo:</dt>
        <dd>{{ user.email }}</dd>
      </div>

      <div class="detail-group">
        <dt>Celular(Telefono):</dt>
        <dd>{{ formatters.formatterPhoneNumber(user.phone) }}</dd>
      </div>

      <div class="detail-group">
        <dt>Genero:</dt>
        <dd>{{ formatters.formatterGender(user.gender) }}</dd>
      </div>

      <div class="detail-group">
        <dt>Departamento:</dt>
        <dd>{{ user.city.department.department_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Fecha Nacimiento:</dt>
        <dd>{{ user.birth_date }}</dd>
      </div>

      <div class="detail-group">
        <dt>Ciudad:</dt>
        <dd>{{ user.city.city_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Activo:</dt>
        <dd>
          <span
            :class="{
              'badge badge--success': user.active,
              'badge badge--muted': !user.active
            }"
          >
            {{ user.active ? 'Sí' : 'No' }}
          </span>
        </dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.detail-card {
  width: 100%;
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: var(--border-radius-size, 8px);
  padding: 20px;
}

.user-name {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0 0 24px 0;
  text-align: left;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px 20px;
  width: 100%;
}

.detail-group {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 12px;
  align-items: center;
}

.detail-group dt {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #616161);
  text-align: left;
}

.detail-group dd {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0;
  text-align: left;
  word-break: break-word;
}

.badge {
  display: inline-block;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.25px;
  border-radius: 4px;
}

.badge--success {
  background: rgba(73, 154, 103, 0.15);
  color: var(--color-success, #499a67);
}

.badge--muted {
  background: rgba(97, 97, 97, 0.1);
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
}

@media (max-width: 768px) {
  .detail-card {
    padding: 20px;
  }

  .user-name {
    font-size: 22px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
