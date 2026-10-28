<script setup>
/**
 * CarryoverPill — pill "Arrastrar saldos de {N−1}" + aviso de fuente bajo el
 * pill (FE-S6-CARRYOVER §5; FD6-2 visible en todo tab, FD6-3 aviso SOLO en
 * tab Flujo).
 *
 * FASE 3: extraído VERBATIM de `BudgetGridEditor.vue` (grupo `ge-carry-group`)
 * como componente PRESENTACIONAL props/emits: el estado vive en
 * `budgetScenarioStore.carryover` y las decisiones (toggle con rollback
 * optimista vía `setCarryoverFlag`, sincronización de saldos SD7-FE-3,
 * disparo LAZY del GET §5) permanecen en `BudgetGridEditor`; aquí solo se
 * reflejan. El checkbox es ONE-WAY (`:checked`): el re-render lo devuelve al
 * estado del store. Emitir `toggle` con el EVENTO crudo (`$event`) para que
 * el handler del padre siga leyendo `event.target.checked` igual que antes.
 */
defineProps({
  /** `carryover.enabled` del store (el optimismo ya lo aplicó la acción). */
  enabled: { type: Boolean, default: false },
  /** `carryover.saving`: PUT en vuelo deshabilita el input. */
  saving: { type: Boolean, default: false },
  /** N−1: año de la fuente (etiqueta del pill y aviso §5); `null` si el escenario no tiene año entero (edge). */
  sourceYear: { type: null, default: null },
  /** El aviso bajo el pill SOLO se pinta en el tab Flujo (FD6-3) — decisión del padre. */
  showHint: { type: Boolean, default: false },
  /** Texto del aviso §5/§7 ya resuelto por el padre (fuente/copy literal/fallo de red). */
  hintText: { type: String, default: '' }
})

const emit = defineEmits(['toggle'])
</script>

<template>
  <!-- FE-S6 §5: pill del arrastre (FD6-2: visible en todo tab; efecto
       solo en Flujo) + aviso de fuente SOLO en tab Flujo (FD6-3). -->
  <div class="ge-carry-group">
    <label
      class="ge-carry-pill"
      :class="{ 'is-on': enabled }"
      title="Solo afecta a esta Vista Flujo; no genera líneas."
    >
      <input
        type="checkbox"
        class="ge-carry-input"
        :checked="enabled"
        :disabled="saving"
        :aria-label="`Arrastrar saldos del año ${sourceYear} al flujo de caja`"
        @change="emit('toggle', $event)"
      />
      <span>Arrastrar saldos de {{ sourceYear }}</span>
    </label>
    <p v-if="showHint" class="ge-carry-hint" aria-live="polite">
      {{ hintText }}
    </p>
  </div>
</template>

<style scoped>
/* Cabecera §5 (FE-S6): pill del arrastre.
 * CSS movido VERBATIM desde `BudgetGridEditor.vue` (FASE 3): las clases
 * `ge-carry-*` solo las usa este bloque. La porción del media query
 * `@media (max-width: 768px) { .ge-carry-group { align-items: flex-start } }`
 * viaja también (el CSS scoped del padre no cruza la frontera del
 * componente). `.ge-header-actions` (contenedor común) queda en el padre. */

.ge-carry-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
}

.ge-carry-pill {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  padding: 6px 13px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface, #f2f4f7);
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    border-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

:root[data-theme='dark'] .ge-carry-pill {
  background-color: rgba(255, 255, 255, 0.05);
}

.ge-carry-pill.is-on {
  border-color: rgba(3, 101, 140, 0.45);
  background-color: rgba(3, 101, 140, 0.1);
  color: var(--color-brand, #03658c);
}

:root[data-theme='dark'] .ge-carry-pill.is-on {
  color: #56c8ee;
}

.ge-carry-pill:has(.ge-carry-input:focus-visible) {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.ge-carry-pill:has(.ge-carry-input:disabled) {
  opacity: 0.6;
  cursor: progress;
}

.ge-carry-input {
  margin: 0;
  accent-color: var(--color-brand, #03658c);
  cursor: inherit;
}

.ge-carry-hint {
  max-width: 320px;
  margin: 0;
  font-size: 0.72rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: right;
}

@media (max-width: 768px) {
  .ge-carry-group {
    align-items: flex-start;
  }
}
</style>
