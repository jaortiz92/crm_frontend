<script setup>
/**
 * ExportMenu — botón "Exportar" + menú de formato (Excel/CSV) del editor de
 * escenario (FE-S20, spec `frontend.03_20`: RF-1/RF-2 botón sobre la fila de
 * pills, RF-7 checks de presencia, RF-10 title explicativo).
 *
 * FASE 3: extraído VERBATIM de `BudgetGridEditor.vue` (caja `ge-export`).
 * El estado abierto/cerrado y el cierre por click fuera (listener global,
 * RF-2) viven AQUÍ; el padre decide `disabled`/`disabledTitle` (checks de
 * PRESENCIA RF-7 sobre la caché de los stores) y resuelve el formato elegido
 * (`@select` → `onExportSelect`, hojas del tab activo RF-3/RF-4/RF-5/RF-6).
 * SVG, `aria-haspopup`/`aria-expanded`, `role="menu( item)"` y textos
 * idénticos.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({
  /** RF-7: botón deshabilitado sin datos para el tab o con carga en vuelo. */
  disabled: { type: Boolean, default: false },
  /** RF-7/RF-10: `title` explicativo cuando está deshabilitado (nunca silent). */
  disabledTitle: { type: String, default: '' }
})

const emit = defineEmits(['select'])

/** Menú de formato abierto (RF-2) + ancla del cierre por click fuera. */
const open = ref(false)
const root = ref(null)

/** Cierre del menú al hacer click fuera (patrón simple con listener global). */
function onDocClickForExport(event) {
  if (!open.value) return
  if (root.value && !root.value.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClickForExport))
onBeforeUnmount(() => document.removeEventListener('click', onDocClickForExport))

/**
 * Selección de formato: cierra el menú y delega al padre (mismo orden que el
 * `onExportSelect` original, que hacía `exportOpen.value = false` primero).
 * @param {'csv'|'xlsx'} format
 */
function onSelect(format) {
  open.value = false
  emit('select', format)
}
</script>

<template>
  <div ref="root" class="ge-export">
    <button
      type="button"
      class="ge-export-btn"
      :class="{ 'is-open': open }"
      :disabled="disabled"
      :title="disabled ? disabledTitle : 'Exportar la tabla de esta pestaña (Excel o CSV)'"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      @click.stop="open = !open"
    >
      <svg
        class="ge-export-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span>Exportar</span>
    </button>
    <div v-if="open" class="ge-export-menu" role="menu" aria-label="Formato de exportación">
      <button type="button" class="ge-export-item" role="menuitem" @click="onSelect('xlsx')">
        Excel (.xlsx)
      </button>
      <button type="button" class="ge-export-item" role="menuitem" @click="onSelect('csv')">
        CSV
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ─── FE-S20 (spec `frontend.03_20`) RF-1/RF-2/RF-7: botón + menú Exportar ───
 * CSS movido VERBATIM desde `BudgetGridEditor.vue` (FASE 3): las clases
 * `ge-export*` solo las usa este bloque. */

.ge-export {
  position: relative;
}

.ge-export-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 8px 16px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface-card, #ffffff);
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

:root[data-theme='dark'] .ge-export-btn {
  background-color: rgba(255, 255, 255, 0.05);
}

.ge-export-icon {
  width: 14px;
  height: 14px;
}

.ge-export-btn:hover:not(:disabled),
.ge-export-btn.is-open {
  background-color: rgba(3, 101, 140, 0.08);
  color: var(--color-text-primary, #070707);
}

:root[data-theme='dark'] .ge-export-btn:hover:not(:disabled),
:root[data-theme='dark'] .ge-export-btn.is-open {
  background-color: rgba(86, 200, 238, 0.12);
  color: #56c8ee;
}

.ge-export-btn:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.ge-export-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ge-export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 190px;
  padding: 6px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  box-shadow: 0 10px 30px rgba(7, 7, 7, 0.16);
}

:root[data-theme='dark'] .ge-export-menu {
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

:root[data-theme='dark'] .ge-export-item {
  color: #d5dde4;
}

.ge-export-item {
  padding: 8px 12px;
  border: none;
  border-radius: 7px;
  background: transparent;
  font-size: 0.8rem;
  color: var(--color-text-primary, #070707);
  text-align: left;
  cursor: pointer;
}

.ge-export-item:hover {
  background-color: rgba(3, 101, 140, 0.08);
}

.ge-export-item:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: -2px;
}
</style>
