<script setup>
/**
 * BudgetUploadsView — vista del Centro de Ingesta (`/budget/upload`).
 * Página: encabezado + descripción para contables + dashboard de tarjetas
 * ETL. Sin lógica de negocio (spec §4): el estado vive en
 * `budgetUploadStore` y la API en `budgetUploadService`.
 */
import { onMounted } from 'vue'
import UploadDashboard from '@/components/budget/upload/UploadDashboard.vue'
import { useBudgetUploadStore } from '@/stores/budgetUploadStore.js'

const budgetUploadStore = useBudgetUploadStore()

onMounted(() => {
  // Una sola petición de status para las 4 tarjetas (§7.2). Si el endpoint
  // aún no existe en el backend, degrada en silencio (§7.4): las subidas
  // funcionan igual.
  budgetUploadStore.fetchStatus()
})
</script>

<template>
  <div class="budget-uploads-page">
    <div class="section-header">
      <div class="section-accent"></div>
      <h2 class="section-title">Centro de Ingesta</h2>
    </div>

    <p class="page-description">
      Actualice los cuatro pilares del motor financiero cargando los archivos Excel del cierre
      mensual: costos reales, gastos operativos, libro de pagos y estado de cartera. Cada columna de
      datos se reemplaza de forma atómica; el sistema valida el contenido y le informa cualquier
      inconsistencia antes de guardar.
    </p>

    <UploadDashboard />
  </div>
</template>

<style scoped>
.budget-uploads-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.page-description {
  max-width: 760px;
  margin: 10px 0 22px;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--color-text-secondary, #555555);
  text-wrap: pretty;
}

@media (max-width: 768px) {
  .budget-uploads-page {
    padding: 20px 16px;
  }
}
</style>
