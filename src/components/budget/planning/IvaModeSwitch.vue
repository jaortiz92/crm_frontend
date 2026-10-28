<script setup>
/**
 * IvaModeSwitch — switch segmentado "Neto / Con IVA" de la barra de cabecera
 * del editor de escenario (FE-S14-IVA §5, D-FE14-1).
 *
 * FASE 3: extraído VERBATIM de `BudgetGridEditor.vue` (grupo `ge-mode-group`)
 * como componente PRESENTACIONAL props/emits: no conoce `budgetIvaStore` ni
 * localStorage — la preferencia POR ESCENARIO sigue siendo propiedad del
 * padre, cuyo handler `onIvaModeSelect` resuelve el toggle
 * (`ivaStore.setIvaMode(idBudget, flag)`, cero HTTP) y el refuerzo del GET
 * del settlement al encender (D-FE14-4). Textos, aria y tooltips idénticos.
 */
defineProps({
  /** Modo vivo (`ivaStore.ivaMode === true`): `true` = "Con IVA". */
  ivaMode: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])
</script>

<template>
  <!-- FE-S14-IVA §5: switch segmentado "Neto / Con IVA" (barra de
       cabecera, visible en todo tab; preferencia POR ESCENARIO en
       localStorage vía el store — D-FE14-1). -->
  <div
    class="ge-mode-group"
    role="group"
    aria-label="Modo de montos: netos o con IVA"
    title="Neto: cifras de presupuesto sin IVA. Con IVA: la Vista Flujo muestra caja bruta proyectada (× 1.19); la cabecera y la Vista Ejecutiva (P&G) siempre muestran netos."
  >
    <span class="ge-mode-caption">Montos</span>
    <div class="ge-mode-switch">
      <button
        type="button"
        class="ge-mode-btn"
        :class="{ 'is-active': !ivaMode }"
        :aria-pressed="!ivaMode ? 'true' : 'false'"
        @click="emit('select', false)"
      >
        Neto
      </button>
      <button
        type="button"
        class="ge-mode-btn"
        :class="{ 'is-active': ivaMode }"
        :aria-pressed="ivaMode ? 'true' : 'false'"
        @click="emit('select', true)"
      >
        Con IVA
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ───────── FE-S14-IVA §5: switch segmentado "Neto / Con IVA" ─────────
 * CSS movido VERBATIM desde `BudgetGridEditor.vue` (FASE 3): las clases
 * `ge-mode-*` solo las usa este bloque. La porción del media query
 * `@media (max-width: 768px) { .ge-mode-group { align-items: flex-start } }`
 * viaja también (el CSS scoped del padre no cruza la frontera del
 * componente). El chip "Modo caja con IVA" (`.chip-iva`) queda en el padre. */

.ge-mode-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
}

.ge-mode-caption {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
}

.ge-mode-switch {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface, #f2f4f7);
}

:root[data-theme='dark'] .ge-mode-switch {
  background-color: rgba(255, 255, 255, 0.05);
}

.ge-mode-btn {
  padding: 5px 13px;
  border: none;
  border-radius: 999px;
  background: transparent;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.ge-mode-btn:hover:not(.is-active) {
  background-color: rgba(3, 101, 140, 0.08);
  color: var(--color-text-primary, #070707);
}

.ge-mode-btn:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.ge-mode-btn.is-active {
  background-color: var(--color-brand, #03658c);
  color: var(--text-white, #eeeeee);
  box-shadow: 0 1px 4px rgba(3, 101, 140, 0.35);
}

@media (max-width: 768px) {
  .ge-mode-group {
    align-items: flex-start;
  }
}
</style>
