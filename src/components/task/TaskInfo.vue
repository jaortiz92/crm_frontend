<script setup>
import { toRefs } from 'vue'

const props = defineProps({
  task: Object
})
const { task } = toRefs(props)
</script>

<template>
  <div class="detail-card">
    <h1 class="task-name">Tarea #{{ task.id_task }}</h1>
    
    <div class="task-description">
      {{ task.task }}
    </div>

    <dl class="detail-grid">
      <div class="detail-group">
        <dt>Cliente:</dt>
        <dd>
          <router-link
            :to="{
              name: 'CustomerDetail',
              params: { id: task.id_customer }
            }"
          >
            {{ task.customer.company_name }}
          </router-link>
        </dd>
      </div>

      <div class="detail-group">
        <dt>Ciudad:</dt>
        <dd>{{ task.customer.city.city_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Creador de la tarea:</dt>
        <dd>{{ task.creator_tasks.first_name }} {{ task.creator_tasks.last_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Responsable de la tarea:</dt>
        <dd>{{ task.responsible_task.first_name }} {{ task.responsible_task.last_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Fecha Creación:</dt>
        <dd>{{ task.creation_date }}</dd>
      </div>

      <div class="detail-group">
        <dt>Fecha Ejecución:</dt>
        <dd v-if="task.execution_date">{{ task.execution_date }}</dd>
        <dd v-else class="muted">Sin Completar</dd>
      </div>

      <div class="detail-group">
        <dt>Completado:</dt>
        <dd>
          <span
            :class="{
              'badge badge--success': task.completed,
              'badge badge--muted': !task.completed
            }"
          >
            {{ task.completed ? 'Sí' : 'No' }}
          </span>
        </dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group detail-pair--full">
        <dt>Comentarios:</dt>
        <dd class="text-value" v-if="task.comment">{{ task.comment }}</dd>
        <dd class="text-value muted" v-else>Sin Comentarios</dd>
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

.task-name {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0 0 16px 0;
  text-align: left;
}

.task-description {
  background: var(--color-brand-light, #d0ebda);
  border-left: 4px solid var(--color-brand, #03658c);
  padding: 16px 20px;
  margin-bottom: 24px;
  border-radius: 0 8px 8px 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--color-text-primary, #070707);
  word-break: break-word;
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

.detail-group dd a {
  color: var(--color-brand, #03658c);
  text-decoration: none;
  font-weight: 600;
}

.detail-group dd a:hover {
  color: var(--color-brand-hover, #05c7f2);
  text-decoration: underline;
}

.detail-pair--full {
  grid-column: 1 / -1;
}

.detail-pair--full dd {
  grid-column: 1 / -1;
}

.text-value {
  font-weight: 400 !important;
  line-height: 1.5;
}

.detail-divider {
  height: 1px;
  background: var(--color-border, rgba(97, 97, 97, 0.15));
  width: 100%;
  margin: 4px 0;
}

.muted {
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
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

  .task-name {
    font-size: 22px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
