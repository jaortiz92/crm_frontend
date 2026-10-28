<script setup>
/**
 * SimulationWhatIfNotice — avisos what-if de NÓMINA simulada y de FINANCIACIÓN
 * simulada de la cabecera del editor de escenario (BE-S11/BE-S12; bloques
 * `ge-payroll-notice ge-payroll-notice-sim`). Un solo componente con prop
 * `kind` ('payroll' | 'financing').
 *
 * FASE 3: extraído VERBATIM de `BudgetGridEditor.vue` como componente
 * PRESENTACIONAL props/emits: la fuente sigue siendo el `budgetSimulationStore`
 * (cachés `payrollSim`/`financingSim`, que llegan por la prop `state`) y el
 * padre deriva `count`/totales porque dependen de SUS mapeos de líneas
 * (`simLines`/`financingSimLines`: el conteo NO es el largo crudo de la
 * caché) y resuelve el reintento con `force` (`@retry`). Textos, orden de
 * spans, `role="status"` y el botón "Reintentar" idénticos. El gate de
 * visibilidad (`scenario.status !== 'active' && (loading || loaded || error)`)
 * queda en el padre como `v-if` del componente.
 */
import { formatMoneyPlain } from './planningFormat.js'

defineProps({
  /** 'payroll' (nómina simulada) | 'financing' (gastos de financiación). */
  kind: { type: String, required: true },
  /** Caché del sub-store de simulación: `{ loading, loaded, error, data, budgetId }`. */
  state: { type: Object, required: true },
  /** Líneas simuladas mapeadas (`payrollSimCount` / `financingSimCount`). */
  count: { type: Number, default: 0 },
  /** payroll: Σ anual (`total_annual`); financing: Σ gastos anuales (`total_annual_expenses`). */
  total: { type: Number, default: 0 },
  /** financing: intereses simulados (`total_interest`). */
  interest: { type: Number, default: 0 },
  /** financing: seguros simulados (`total_insurance`). */
  insurance: { type: Number, default: 0 }
})

const emit = defineEmits(['retry'])
</script>

<template>
  <div class="ge-payroll-notice ge-payroll-notice-sim" role="status">
    <template v-if="kind === 'payroll'">
      <span v-if="state.loading">Proyectando nómina simulada…</span>
      <span v-else-if="state.error">
        No se pudo simular la nómina en este escenario (¿faltan parámetros de la vigencia?).
      </span>
      <span v-else-if="count">
        Nómina simulada: {{ count }} líneas · Σ anual
        {{ formatMoneyPlain(total) }} — cifras what-if (no materializadas); marca Meta
        Activa para proyectarlas de verdad.
      </span>
      <span v-else>Nómina simulada: sin colaboradores con salario vigente proyectable.</span>
    </template>
    <template v-else>
      <span v-if="state.loading">Simulando gastos de financiación…</span>
      <span v-else-if="state.error">
        No se pudo cargar la simulación de financiación para este escenario.
      </span>
      <span v-else-if="count">
        Financiación simulada: {{ count }} líneas de gasto ({{
          state.data?.financing_credits_count ?? 0
        }}
        créditos) · Intereses {{ formatMoneyPlain(interest) }} · Seguros
        {{ formatMoneyPlain(insurance) }} · Σ gastos anuales
        {{ formatMoneyPlain(total) }} — cifras what-if/no materializadas; al marcar
        Meta Activa se materializan.
      </span>
      <span v-else>
        Financiación simulada: sin líneas de interés o seguro proyectables. Estas cifras what-if
        no se materializan hasta marcar Meta Activa.
      </span>
    </template>
    <button
      v-if="state.error"
      type="button"
      class="ge-payroll-action"
      :disabled="state.loading"
      @click="emit('retry')"
    >
      Reintentar
    </button>
  </div>
</template>

<style scoped>
/* BE-S11/BE-S12: avisos what-if (variante ámbar, simulada, no materializada).
 * DUPLICACIÓN CONSCIENTE (FASE 3, documentada): `.ge-payroll-notice`,
 * `.ge-payroll-notice-sim` y `.ge-payroll-action` siguen definidas en
 * `BudgetGridEditor.vue` porque las comparten el banner de materialización de
 * nómina (BE-S11 enmienda) y el aviso de capital del tab Flujo, que permanecen
 * en el padre; el CSS scoped no cruza la frontera del componente, así que
 * este hijo lleva su propia copia con los MISMOS valores. */

.ge-payroll-notice {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin: 10px 0 0;
  padding: 10px 14px;
  border: 1px solid #fde68a;
  border-left: 4px solid #d97706;
  border-radius: 8px;
  background: #fffbeb;
  color: #92400e;
  font-size: 13px;
}

/* BE-S11 what-if: variante ámbar (simulada, no materializada) */

.ge-payroll-notice-sim {
  border-style: dashed;
}

.ge-payroll-notice-sim .ge-payroll-action {
  border-color: rgba(217, 119, 6, 0.45);
  background-color: rgba(217, 119, 6, 0.12);
  color: #b45309;
}

:root[data-theme='dark'] .ge-payroll-notice-sim .ge-payroll-action {
  color: #fbbf24;
}
.ge-payroll-action {
  border: 1px solid #d97706;
  border-radius: 6px;
  background: #fff;
  color: #b45309;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.ge-payroll-action:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
