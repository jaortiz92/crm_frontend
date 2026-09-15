<script setup>
/**
 * ScenarioTable — tabla del dashboard de Planeación (FE-S4 §6.1/§6.2).
 *
 * Columnas: Nombre · Año · Tipo · Líneas · Σ Ingresos · Σ Gastos · Estado ·
 * Creado · Acciones. El ORDEN es el que entrega el backend (§6.1: no
 * re-ordenar en cliente). "Marcar como Meta Activa" solo si `status !==
 * 'active'` Y `canSetBudgetTarget()` (gate pasado por el padre). "Eliminar"
 * SOLO en filas `draft` (frontend.03_07: el backend es la autoridad; emite
 * `request-delete` y el dashboard abre el modal de confirmación). Todas las
 * acciones se bloquean con `busy` (isSubmitting del store, AC-FE-8).
 */
import { formatCount, formatDateEs, formatMoney, statusChipOf } from './planningFormat.js'

defineProps({
  /** @type {Array<object>} filas agregadas del backend (§5.4). */
  rows: { type: Array, required: true },
  /** Rol puede designar la meta activa (§3.3). */
  canTarget: { type: Boolean, default: false },
  /** Operación en vuelo: deshabilita acciones (NFR-F4). */
  busy: { type: Boolean, default: false }
})

const emit = defineEmits(['view', 'set-target', 'clone', 'request-delete'])
</script>

<template>
  <div class="sc-zone">
    <div class="sc-scroll">
      <table class="sc-table" aria-label="Escenarios presupuestales">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Año</th>
            <th>Tipo</th>
            <th>Líneas</th>
            <th class="is-money-col">Σ Ingresos</th>
            <th class="is-money-col">Σ Gastos</th>
            <th>Estado</th>
            <th>Creado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id_budget">
            <td class="cell-name" :title="row.budget_name">{{ row.budget_name || '—' }}</td>
            <td class="cell-year">{{ row.budget_year }}</td>
            <td>
              <!-- Padre: `↳ de {parent}` como tooltip (§6.1); clon = Escenario. -->
              <span
                class="chip chip-type"
                :class="row.is_scenario ? 'chip-scenario' : 'chip-base'"
                :title="row.parent_budget_name ? `↳ de ${row.parent_budget_name}` : undefined"
              >
                {{ row.is_scenario ? 'Escenario' : 'Base' }}
              </span>
            </td>
            <td class="cell-count">{{ formatCount(row.lines_count) }}</td>
            <td class="cell-money">{{ formatMoney(row.total_income) }}</td>
            <td class="cell-money">{{ formatMoney(row.total_expense) }}</td>
            <td>
              <span class="chip" :class="`chip-${statusChipOf(row.status).tone}`">
                {{ statusChipOf(row.status).label }}
              </span>
            </td>
            <td class="cell-date">{{ formatDateEs(row.created_at) }}</td>
            <td>
              <div class="row-actions">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="busy"
                  @click="emit('view', row)"
                >
                  Ver Detalles
                </button>
                <button
                  v-if="row.status !== 'active' && canTarget"
                  type="button"
                  class="btn btn-outline btn-sm"
                  :disabled="busy"
                  @click="emit('set-target', row)"
                >
                  Marcar como Meta Activa
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="busy"
                  @click="emit('clone', row)"
                >
                  Clonar
                </button>
                <button
                  v-if="row.status === 'draft'"
                  type="button"
                  class="btn btn-danger btn-sm"
                  :disabled="busy"
                  @click="emit('request-delete', row)"
                >
                  Eliminar
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.sc-zone {
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.sc-scroll {
  max-height: 66vh;
  overflow: auto;
  border-radius: inherit;
}

.sc-table {
  width: 100%;
  min-width: 1080px;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.sc-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
}

.sc-table .cell-name {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.sc-table .cell-year,
.sc-table .cell-count,
.sc-table .cell-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sc-table .cell-money,
.sc-table .is-money-col {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.chip {
  display: inline-block;
  padding: 3px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.chip-base {
  border-color: rgba(30, 142, 90, 0.4);
  background-color: rgba(30, 142, 90, 0.1);
  color: #1e6b47;
}

:root[data-theme='dark'] .chip-base {
  color: #7bd8a8;
}

.chip-scenario {
  border-color: rgba(20, 161, 217, 0.45);
  background-color: rgba(20, 161, 217, 0.1);
  color: #14718f;
}

:root[data-theme='dark'] .chip-scenario {
  color: #7fd4ef;
}

.chip-active {
  border-color: rgba(46, 164, 79, 0.45);
  background-color: rgba(46, 164, 79, 0.12);
  color: #22683a;
}

:root[data-theme='dark'] .chip-active {
  color: #7bd89a;
}

.chip-draft {
  border-color: rgba(120, 120, 120, 0.35);
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-secondary, #555555);
}

:root[data-theme='dark'] .chip-draft {
  color: #b8c4d0;
}

.chip-closed {
  border-color: rgba(180, 83, 9, 0.4);
  background-color: rgba(245, 158, 11, 0.1);
  color: #96590a;
}

:root[data-theme='dark'] .chip-closed {
  color: #f6c177;
}

.row-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  white-space: nowrap;
}
</style>
