<script setup>
/**
 * CollaboratorImportPanel — ingesta de la plantilla "Solicitud Presupuesto
 * Nómina/Colaboradores" (FE-S15-COLLAB §5, D-FE15-2; backend.02_21 §6/§9).
 *
 * D-FE15-2: vive COLAPSABLE dentro de CollaboratorsView, NO en el Centro de
 * Ingesta (la plantilla nómina es flujo de maestro+proyección, no cargue de
 * escenario); se reutiliza solo el PATRÓN visual: `FileDropZone` del 03_01
 * (.xlsx + tamaño) y la tabla "Fila Excel / Motivo" del 400 con la
 * rejilla `invalid_rows` de compras (03_12).
 *
 * Estados (§6):
 *  - subiendo: spinner + bloqueo de doble submit (`uploading` flag);
 *  - 400 todo-o-nada (BR-04/R-06): tabla fila/motivo + mensaje LITERAL
 *    "No se importó NADA (todo-o-nada). Corrija y vuelva a subir." — el
 *    panel conserva el archivo para reintentar;
 *  - 200: chips {imported, created, updated, no_change, generated_lines} +
 *    nota permanente de la regla §7.4 + botón [Ir al escenario];
 *  - 403/404/422/red: banner con el `detail.message` del BE (sin inventar).
 *
 * Regla §7.4 (refuerzo A-01/R-08): el texto de ayuda exige capturar SOLO el
 * salario: "Capture solo el salario; el sistema calcula auxilio, seguridad
 * social, parafiscales y provisiones".
 *
 * R-09/D-FE15-9: el resumen informa que el import regeneró la ventana
 * completa del colaborador (el motor lo reporta en `generated_lines`).
 *
 * Emite `imported` tras un 200 para que la vista refresque el listado.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FileDropZone from '@/components/budget/upload/FileDropZone.vue'
import {
  budgetCollaboratorService,
  classifyCollaboratorError
} from '@/services/budgetCollaboratorService.js'
import { formatCount } from '@/components/budget/planning/planningFormat.js'

const emit = defineEmits(['imported'])

const router = useRouter()

const file = ref(null)
const uploading = ref(false)
/** @type {null | {message: string, rows: Array<{excel_row, motivo}>}} */
const invalidState = ref(null)
/** @type {null | object} resumen 200 */
const summary = ref(null)
const bannerError = ref('')

const canSubmit = computed(() => file.value instanceof File && !uploading.value)

/** Archivo nuevo ⇒ resultados anteriores quedan sin sentido (§6). */
watch(file, () => {
  invalidState.value = null
  summary.value = null
  bannerError.value = ''
})

const summaryChips = computed(() => {
  const data = summary.value
  if (!data) return []
  return [
    { key: 'imported', label: 'Importados', value: data.imported },
    { key: 'created', label: 'Creados', value: data.created },
    { key: 'updated', label: 'Actualizados', value: data.updated },
    { key: 'no_change', label: 'Sin cambios', value: data.no_change },
    { key: 'generated_lines', label: 'Líneas generadas', value: data.generated_lines }
  ].filter((chip) => chip.value !== null && chip.value !== undefined)
})

async function handleImport() {
  if (!canSubmit.value) return
  uploading.value = true
  invalidState.value = null
  summary.value = null
  bannerError.value = ''
  try {
    const response = await budgetCollaboratorService.importCollaborators(file.value)
    summary.value = response?.data ?? {}
    emit('imported')
  } catch (err) {
    const result = classifyCollaboratorError(err)
    if (result.kind === 'invalid_rows') {
      invalidState.value = {
        message: result.message,
        rows: result.invalid_rows.map((row) => ({
          excel_row: row?.excel_row ?? '—',
          motivo: row?.motivo ?? row?.reason ?? 'Motivo no informado por el servidor.'
        }))
      }
    } else if (result.kind === 'forbidden') {
      bannerError.value = result.message || 'No tiene permiso para importar nómina.'
    } else if (result.kind === 'network') {
      bannerError.value = 'Sin conexión con el servidor. El archivo sigue cargado: reintente.'
    } else {
      // R-05 (vigencia sin parámetros) y resto: el BE manda el mensaje
      // estructurado; se pinta SU texto, jamás uno inventado (§6 spec FE).
      bannerError.value = result.message || 'El servidor rechazó la importación. Reintente.'
    }
  } finally {
    uploading.value = false
  }
}

function clearFile() {
  if (uploading.value) return
  file.value = null
  invalidState.value = null
  summary.value = null
  bannerError.value = ''
}

function goToScenario() {
  router.push({ name: 'BudgetPlanning' })
}
</script>

<template>
  <section class="cip-panel" aria-label="Importar plantilla de nómina">
    <div class="cip-columns">
      <div class="cip-left">
        <p class="cip-heading">Plantilla «Solicitud Presupuesto Nómina/Colaboradores»</p>
        <p class="cip-note cip-note-strong">
          Capture solo el salario; el sistema calcula auxilio, seguridad social, parafiscales y
          provisiones.
        </p>
        <p class="cip-note">
          Una fila = un colaborador (Documento es la clave del upsert). El import es todo-o-nada y
          regenera la ventana completa de proyección de cada colaborador del archivo.
        </p>
        <FileDropZone
          v-model="file"
          dataset-key="nomina-colaboradores"
          :max-mb="10"
          :disabled="uploading"
          hint-file="Formato Solicitud Presupuesto Nómina-Colaboradores.xlsx"
        />
      </div>

      <div class="cip-right">
        <!-- ─────────── resumen 200 (chips) ─────────── -->
        <div v-if="summary" class="cip-summary" aria-live="polite">
          <p class="cip-result-title">Importación completada</p>
          <ul class="cip-chips">
            <li v-for="chip in summaryChips" :key="chip.key" class="cip-chip">
              <span class="cip-chip-label">{{ chip.label }}</span>
              <strong class="cip-chip-value">{{ formatCount(chip.value) }}</strong>
            </li>
          </ul>
          <p class="cip-note">
            El sistema calcula auxilio, seguridad social, parafiscales y provisiones: las líneas
            quedan visibles en la Cuadrícula con el chip «Nómina».
          </p>
          <button type="button" class="btn btn-secondary btn-sm" @click="goToScenario">
            Ir al escenario
          </button>
        </div>

        <!-- ─────────── 400 fila/motivo (todo-o-nada) ─────────── -->
        <div v-else-if="invalidState" class="cip-invalid" role="alert">
          <p class="cip-result-title cip-result-danger">
            El archivo tiene filas inválidas: no se importó NADA
          </p>
          <p class="cip-note cip-note-strong">
            No se importó NADA (todo-o-nada). Corrija y vuelva a subir.
          </p>
          <p v-if="invalidState.message" class="cip-note">{{ invalidState.message }}</p>
          <div class="cip-invalid-table-zone">
            <table class="cip-invalid-table">
              <thead>
                <tr>
                  <th scope="col">Fila Excel</th>
                  <th scope="col">Motivo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in invalidState.rows" :key="`${row.excel_row}-${index}`">
                  <td class="cip-cell-num">{{ row.excel_row }}</td>
                  <td class="cip-cell-reason">{{ row.motivo }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ─────────── error genérico ─────────── -->
        <div v-else-if="bannerError" class="cip-banner" role="alert">
          {{ bannerError }}
        </div>

        <div class="cip-actions">
          <button
            type="button"
            class="btn btn-primary cip-submit"
            :disabled="!canSubmit"
            @click="handleImport"
          >
            <span v-if="uploading" class="cip-spinner" aria-hidden="true"></span>
            {{ uploading ? 'Subiendo…' : 'Subir plantilla' }}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="uploading || !file"
            @click="clearFile"
          >
            Limpiar
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cip-panel {
  padding: 14px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.cip-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
  align-items: start;
}

.cip-left,
.cip-right {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.cip-heading {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
}

.cip-note {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--color-text-secondary, #555555);
}

.cip-note-strong {
  font-weight: 600;
  color: var(--color-text-primary, #070707);
}

.cip-result-title {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 700;
  color: #22683a;
}

:root[data-theme='dark'] .cip-result-title {
  color: #7bd89a;
}

.cip-result-danger {
  color: #9b2222;
}

:root[data-theme='dark'] .cip-result-danger {
  color: #ff9b9b;
}

.cip-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0;
  padding: 0;
  list-style: none;
}

.cip-chip {
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
  padding: 5px 12px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.76rem;
}

:root[data-theme='dark'] .cip-chip {
  background-color: rgba(255, 255, 255, 0.05);
}

.cip-chip-label {
  color: var(--color-text-secondary, #555555);
}

.cip-chip-value {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
}

.cip-invalid {
  padding: 12px 14px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
}

.cip-invalid-table-zone {
  max-height: 260px;
  overflow: auto;
  margin-top: 10px;
}

.cip-invalid-table {
  width: 100%;
  font-size: 0.76rem;
}

.cip-cell-num {
  width: 90px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.cip-cell-reason {
  text-align: left;
}

.cip-banner {
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.8rem;
  line-height: 1.5;
  color: #9b2222;
  overflow-wrap: anywhere;
}

:root[data-theme='dark'] .cip-banner {
  color: #ff9b9b;
}

.cip-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
}

.cip-submit {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.cip-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: cip-spin 0.8s linear infinite;
}

@keyframes cip-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cip-spinner {
    animation-duration: 1.6s;
  }
}
</style>
