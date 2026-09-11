<script setup>
/**
 * RatesDataTable — tabla reutilizable de reglas financieras (spec §9).
 *
 * Lee las filas crudas desde la caché del store (`rates[kind]`) y aplica
 * filtros/orden SOLO client-side (A4/A15, NFR-2: jamás dispara HTTP).
 * Emite la fila completa para que la vista decida (editar/archivar/reactivar).
 *
 * Regla de oro (§11): no existe botón "Eliminar"/DELETE — la acción visible
 * es "Archivar" (`PUT is_active:false`).
 */
import { computed } from 'vue'
import { RATE_KINDS, localToday } from '@/components/budget/rates/ratesConfig.js'
import { useBudgetRulesStore } from '@/stores/budgetRulesStore.js'

const props = defineProps({
  /** Pilar: 'cost' | 'commission' (define columnas/labels, §7). */
  kind: { type: String, required: true },
  /** 'all' | 'global' | id_line numérico en string (§8.3). */
  lineFilter: { type: String, default: 'all' },
  /** Toggle "solo activas": `is_active === true`, NO excluye vencidas (A10). */
  activeOnly: { type: Boolean, default: true },
  /** Contiene-insensible sobre `rate_name`. */
  search: { type: String, default: '' }
})

const emit = defineEmits(['edit', 'archive', 'restore'])

const budgetRulesStore = useBudgetRulesStore()

const cfg = computed(() => RATE_KINDS[props.kind])

/** Filas crudas del kind ([] si nunca cargada: el spinner es de la vista). */
const rawRows = computed(() => budgetRulesStore.rates[props.kind] ?? [])

const isEmpty = computed(() => rawRows.value.length === 0)

const emptyMessage = computed(() =>
  isEmpty.value
    ? "No hay reglas todavía. Crea la primera con '+ Nueva regla'."
    : 'Sin coincidencias para los filtros aplicados.'
)

/**
 * Orden fijo A15: `date_from` desc → `id_line` asc (globales primero) → id asc.
 * ISO `YYYY-MM-DD` compara lexicográficamente sin riesgo de zona.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareRows(a, b) {
  const fromA = String(a.date_from ?? '')
  const fromB = String(b.date_from ?? '')
  if (fromA !== fromB) return fromA < fromB ? 1 : -1
  const lineA = a.id_line ?? -1
  const lineB = b.id_line ?? -1
  if (lineA !== lineB) return lineA - lineB
  return (a[cfg.value.idField] ?? 0) - (b[cfg.value.idField] ?? 0)
}

/** Filtros §8.3 + orden §9.2 (el sort recibe una copia nueva de `filter`). */
const visibleRows = computed(() => {
  const term = props.search.trim().toLowerCase()
  const rows = rawRows.value.filter((row) => {
    if (props.activeOnly && row.is_active !== true) return false
    if (props.lineFilter === 'global') {
      if (row.id_line !== null) return false
    } else if (props.lineFilter !== 'all' && row.id_line !== Number(props.lineFilter)) {
      return false
    }
    if (
      term &&
      !String(row.rate_name ?? '')
        .toLowerCase()
        .includes(term)
    )
      return false
    return true
  })
  return rows.sort(compareRows)
})

/**
 * Chip de estado con los tres valores de §9.3 (A11): Archivada (gris) /
 * Vencida (ámbar: sigue `is_active` pero `date_to < hoy local`) / Activo.
 * @param {object} row
 * @returns {{ label: string, tone: string }}
 */
function statusOf(row) {
  if (row.is_active !== true) return { label: 'Archivada', tone: 'archived' }
  if (String(row.date_to ?? '') < localToday()) return { label: 'Vencida', tone: 'expired' }
  return { label: 'Activo', tone: 'active' }
}

/**
 * `dd/mm/aaaa` a partir de ISO puro sin corrimiento de zona (comparación de
 * cadenas + reensamble; para datetime cae a componentes locales).
 * @param {string|null|undefined} value
 * @returns {string}
 */
function formatDate(value) {
  if (!value) return '—'
  const plain = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

/** Porcentaje con 2 decimales fijos + sufijo % (A9). */
function formatPct(row) {
  const value = Number(row[cfg.value.pctField])
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : '—'
}
</script>

<template>
  <div class="rates-table-zone">
    <div class="rates-scroll">
      <table class="rates-table" :aria-label="`Reglas de ${cfg.tabLabel}`">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Línea</th>
            <th>{{ cfg.pctLabel }}</th>
            <th>Vigencia Desde</th>
            <th>Vigencia Hasta</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row[cfg.idField]">
            <td class="cell-name" :title="row.rate_name || ''">{{ row.rate_name || '—' }}</td>
            <td>
              <span v-if="row.id_line === null" class="chip chip-global">Global</span>
              <span v-else class="cell-line">{{ budgetRulesStore.lineNameById(row.id_line) }}</span>
            </td>
            <td class="cell-pct">{{ formatPct(row) }}</td>
            <td class="cell-date">{{ formatDate(row.date_from) }}</td>
            <td class="cell-date">{{ formatDate(row.date_to) }}</td>
            <td>
              <span class="chip" :class="`chip-${statusOf(row).tone}`">
                {{ statusOf(row).label }}
              </span>
            </td>
            <td>
              <div class="row-actions">
                <button type="button" class="btn btn-secondary btn-sm" @click="emit('edit', row)">
                  Editar
                </button>
                <button
                  v-if="row.is_active === true"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="emit('archive', row)"
                >
                  Archivar
                </button>
                <button
                  v-else
                  type="button"
                  class="btn btn-outline btn-sm"
                  @click="emit('restore', row)"
                >
                  Reactivar
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="visibleRows.length === 0" class="rates-empty" aria-live="polite">
        {{ emptyMessage }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.rates-table-zone {
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

/* Scroll con cabecera fija (§9.2) */
.rates-scroll {
  max-height: 60vh;
  overflow: auto;
  border-radius: inherit;
}

.rates-table {
  min-width: 960px;
  border: none;
  border-radius: 0;
  overflow: visible;
  box-shadow: none;
}

.rates-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
}

.rates-table .cell-name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.rates-table .cell-line {
  font-size: 0.8rem;
}

.rates-table .cell-pct {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.rates-table .cell-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Chips de estado (§9.3) y de línea global (§5.3) */

.chip {
  display: inline-block;
  padding: 3px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.chip-global {
  border-color: rgba(3, 101, 140, 0.35);
  background-color: rgba(3, 101, 140, 0.08);
  color: var(--color-brand, #03658c);
}

:root[data-theme='dark'] .chip-global {
  color: #56c8ee;
}

.chip-active {
  border-color: rgba(46, 164, 79, 0.45);
  background-color: rgba(46, 164, 79, 0.12);
  color: #22683a;
}

:root[data-theme='dark'] .chip-active {
  color: #7bd89a;
}

.chip-expired {
  border-color: rgba(214, 158, 46, 0.5);
  background-color: rgba(245, 158, 11, 0.13);
  color: #96590a;
}

:root[data-theme='dark'] .chip-expired {
  color: #f6c177;
}

.chip-archived {
  border-color: rgba(120, 120, 120, 0.35);
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-secondary, #555555);
}

:root[data-theme='dark'] .chip-archived {
  color: #b8c4d0;
}

/* Acciones por fila */

.row-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  white-space: nowrap;
}

/* Estados vacíos (§9.5) */

.rates-empty {
  margin: 0;
  padding: 26px 16px;
  font-size: 0.85rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .rates-table thead th {
    position: sticky;
  }
}
</style>
