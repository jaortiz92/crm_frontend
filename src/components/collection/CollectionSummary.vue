<script setup>
import { ref, computed, defineProps, toRefs, watch } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  collectionSummary: {
    type: Array,
    default: () => []
  }
})

const { collectionSummary } = toRefs(props)

// Reactive filters, sorting, and pagination
const selectedYear = ref(new Date().getFullYear())
const selectedLine = ref('Todas')
const sortKey = ref('')
const sortAsc = ref(true)

const itemsScale = ref(4)
const itemsToShow = ref(itemsScale.value)

// Extract unique years dynamically from dataset
const availableYears = computed(() => {
  if (!collectionSummary.value) return []
  const years = collectionSummary.value.map((item) => item.year).filter(Boolean)
  return [...new Set(years)].sort((a, b) => b - a)
})

// Extract unique line names dynamically from dataset
const availableLines = computed(() => {
  if (!collectionSummary.value) return []
  const lines = collectionSummary.value.map((item) => item.line_name).filter(Boolean)
  return [...new Set(lines)].sort()
})

// Filter and Sort dataset in real-time
const filteredSummary = computed(() => {
  let result = collectionSummary.value || []

  // Apply Year filter
  if (selectedYear.value !== 'Todos') {
    result = result.filter((item) => item.year === Number(selectedYear.value))
  }

  // Apply Line filter
  if (selectedLine.value !== 'Todas') {
    result = result.filter((item) => item.line_name === selectedLine.value)
  }

  // Apply Sorting
  if (sortKey.value) {
    result = [...result].sort((a, b) => {
      let valA = a[sortKey.value]
      let valB = b[sortKey.value]

      if (typeof valA === 'string') {
        return sortAsc.value ? valA.localeCompare(valB) : valB.localeCompare(valA)
      } else {
        return sortAsc.value ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0)
      }
    })
  }

  return result
})

// Paginated items
const limitedItems = computed(() => {
  return filteredSummary.value.slice(0, itemsToShow.value)
})

// Calculate KPI totals dynamically based on filtered set
const kpiTotals = computed(() => {
  const data = filteredSummary.value
  const budget = data.reduce((sum, item) => sum + (item.budget || 0), 0)
  const orderWithoutTax = data.reduce((sum, item) => sum + (item.order_without_tax || 0), 0)
  const invoiceWithoutTax = data.reduce((sum, item) => sum + (item.invoice_without_tax || 0), 0)

  return {
    budget,
    orderWithoutTax,
    invoiceWithoutTax
  }
})

// Handle dynamic sorting
const sortBy = (key) => {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

// Reset pagination scale when filters change
watch([selectedYear, selectedLine], () => {
  itemsToShow.value = itemsScale.value
})

// Pagination actions
const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
const showAll = () => {
  itemsToShow.value = filteredSummary.value.length
}
</script>

<template>
  <div class="summary-panel-wrapper">
    <!-- Top Filter Bar -->
    <div class="summary-filters-bar">
      <div class="summary-title-section">
        <h3>Resumen Colecciones</h3>
        <p class="subtitle">
          Visualiza y analiza el desempeño financiero de las colecciones activas
        </p>
      </div>
      <div class="summary-controls">
        <div class="field-input-wrapper">
          <label>Filtrar por Año</label>
          <select v-model="selectedYear" class="modern-select">
            <option value="Todos">Todos los años</option>
            <option v-for="year in availableYears" :key="year" :value="year">
              {{ year }}
            </option>
          </select>
        </div>
        <div class="field-input-wrapper">
          <label>Filtrar por Línea</label>
          <select v-model="selectedLine" class="modern-select">
            <option value="Todas">Todas las líneas</option>
            <option v-for="line in availableLines" :key="line" :value="line">
              {{ line }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Top KPI Cards Row -->
    <div class="kpi-cards-grid" v-if="filteredSummary.length > 0">
      <!-- KPI Card 1: Presupuesto Acumulado -->
      <div class="kpi-card budget-kpi">
        <div class="kpi-icon-wrapper">
          <svg
            class="kpi-icon"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div class="kpi-content">
          <span class="kpi-title">Presupuesto Acumulado</span>
          <h4 class="kpi-value">${{ formatters.formatterGeneralNumber(kpiTotals.budget) }}</h4>
        </div>
      </div>

      <!-- KPI Card 2: Prendas Ordenadas -->
      <div class="kpi-card orders-kpi">
        <div class="kpi-icon-wrapper">
          <svg
            class="kpi-icon"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
        </div>
        <div class="kpi-content">
          <span class="kpi-title">Prendas Ordenadas</span>
          <h4 class="kpi-value">
            ${{ formatters.formatterGeneralNumber(kpiTotals.orderWithoutTax) }}
          </h4>
        </div>
      </div>

      <!-- KPI Card 3: Valor Facturado -->
      <div class="kpi-card invoices-kpi">
        <div class="kpi-icon-wrapper">
          <svg
            class="kpi-icon"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div class="kpi-content">
          <span class="kpi-title">Valor Facturado (Sin Imp)</span>
          <h4 class="kpi-value">
            ${{ formatters.formatterGeneralNumber(kpiTotals.invoiceWithoutTax) }}
          </h4>
        </div>
      </div>
    </div>

    <!-- Main Table Section -->
    <div v-if="filteredSummary.length > 0" class="summary-table-section">
      <div class="table-responsive-container">
        <table class="table-customer-summary">
          <thead>
            <tr>
              <th @click="sortBy('short_collection_name')" class="sortable-th">
                <div class="th-content">
                  <span>Colección</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'short_collection_name'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('line_name')" class="sortable-th">
                <div class="th-content">
                  <span>Línea</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'line_name'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('year')" class="sortable-th">
                <div class="th-content">
                  <span>Año / Trim.</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'year'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('customers')" class="sortable-th">
                <div class="th-content">
                  <span>Clientes</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'customers'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('customer_trips')" class="sortable-th">
                <div class="th-content">
                  <span>N° Viajes</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'customer_trips'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('budget_quantities')" class="sortable-th">
                <div class="th-content">
                  <span>Presup. Prendas</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'budget_quantities'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('budget')" class="sortable-th">
                <div class="th-content">
                  <span>Presup. Valor</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'budget'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('orders')" class="sortable-th">
                <div class="th-content">
                  <span>N° Ordenes</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'orders'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('order_quantities')" class="sortable-th">
                <div class="th-content">
                  <span>Prendas Ord.</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'order_quantities'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('order_without_tax')" class="sortable-th">
                <div class="th-content">
                  <span>Valor Ordenes</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'order_without_tax'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('invoice_without_tax')" class="sortable-th">
                <div class="th-content">
                  <span>Valor Fact.</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'invoice_without_tax'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
              <th @click="sortBy('invoice_discount')" class="sortable-th">
                <div class="th-content">
                  <span>Descuento</span>
                  <span class="sort-icon-holder" v-show="sortKey === 'invoice_discount'">
                    <svg
                      v-if="sortAsc"
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      class="sort-arrow"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in limitedItems"
              :key="item.short_collection_name + '-' + item.line_name"
            >
              <td class="text-left font-bold">
                <span class="collection-pill">{{ item.short_collection_name }}</span>
              </td>
              <td class="text-left font-medium">{{ item.line_name }}</td>
              <td>{{ item.year }}-Q{{ item.quarter }}</td>
              <td class="text-right">{{ item.customers }}</td>
              <td class="text-right">{{ item.customer_trips }}</td>
              <td class="text-right font-medium">
                {{ formatters.formatterGeneralNumber(item.budget_quantities) }}
              </td>
              <td class="text-right budget-amount font-semibold">
                ${{ formatters.formatterGeneralNumber(item.budget) }}
              </td>
              <td class="text-right">{{ item.orders }}</td>
              <td class="text-right font-medium">
                {{ formatters.formatterGeneralNumber(item.order_quantities) }}
              </td>
              <td class="text-right font-semibold">
                ${{ formatters.formatterGeneralNumber(item.order_without_tax) }}
              </td>
              <td class="text-right invoice-amount font-semibold">
                ${{ formatters.formatterGeneralNumber(item.invoice_without_tax) }}
              </td>
              <td class="text-right discount-amount font-semibold">
                ${{ formatters.formatterGeneralNumber(item.invoice_discount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination / Mostrar Mas Controles -->
      <div class="summary-footer-bar">
        <span class="pagination-info">
          Mostrando {{ Math.min(itemsToShow, filteredSummary.length) }} de
          {{ filteredSummary.length }} colecciones
        </span>
        <div class="buttons-to-show">
          <button class="button-outline" v-if="itemsToShow > itemsScale" @click="showLess">
            <svg
              class="btn-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                clip-rule="evenodd"
              />
            </svg>
            <span>Mostrar menos</span>
          </button>
          <button
            class="button-outline"
            v-if="itemsToShow < filteredSummary.length"
            @click="showMore"
          >
            <svg
              class="btn-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
            <span>Mostrar más</span>
          </button>
          <button
            class="button-primary"
            v-if="itemsToShow < filteredSummary.length"
            @click="showAll"
          >
            <span>Mostrar Todo</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-summary-state">
      <div class="empty-icon-wrapper">
        <svg
          class="empty-icon"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414a1 1 0 006.586 13H4"
          />
        </svg>
      </div>
      <h4>No se encontraron colecciones para los filtros seleccionados</h4>
      <p>Intenta ajustar la combinación de Año y Línea o agrega nuevos registros en el sistema.</p>
    </div>
  </div>
</template>

<style scoped>
.summary-panel-wrapper {
  background-color: #ffffff;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.05);
  margin-bottom: 2rem;
  font-family: Helvetica, Arial, sans-serif;
}

/* Title & Filters Row */
.summary-filters-bar {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

@media (min-width: 992px) {
  .summary-filters-bar {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-end;
  }
}

.summary-title-section {
  text-align: left;
}

.summary-title-section h3 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--dark-color);
  margin: 0 0 0.25rem 0;
  text-align: left;
}

.summary-title-section .subtitle {
  font-size: 0.85rem;
  color: #666;
  margin: 0;
}

.summary-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

@media (min-width: 768px) {
  .summary-controls {
    flex-direction: row;
    align-items: flex-end;
    width: auto;
  }
}

.field-input-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.field-input-wrapper label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-gray);
  margin-bottom: 0.25rem;
  padding-left: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.modern-select {
  padding: 8px 12px;
  font-size: 0.85rem;
  border: 1.5px solid var(--light-border);
  border-radius: 8px;
  background-color: #ffffff;
  color: var(--text-black);
  outline: none;
  cursor: pointer;
  transition: all 0.2s ease;
  margin: 0;
  width: 160px;
  height: 38px;
  box-sizing: border-box;
}

.modern-select:focus {
  border-color: var(--normal-color);
  box-shadow: 0 0 0 3px rgba(20, 161, 217, 0.15);
}

/* KPI Cards Grid */
.kpi-cards-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (min-width: 768px) {
  .kpi-cards-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);
  transition: all 0.25s ease;
  position: relative;
  overflow: hidden;
  text-align: left;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.06);
}

/* KPI specifics */
.budget-kpi {
  border-left: 4px solid var(--normal-color);
}
.orders-kpi {
  border-left: 4px solid var(--dark-color-opposite-one);
}
.invoices-kpi {
  border-left: 4px solid var(--dark-color);
}

.budget-kpi .kpi-icon-wrapper {
  background-color: rgba(20, 161, 217, 0.1);
  color: var(--normal-color);
}
.orders-kpi .kpi-icon-wrapper {
  background-color: rgba(73, 154, 103, 0.1);
  color: var(--dark-color-opposite-one);
}
.invoices-kpi .kpi-icon-wrapper {
  background-color: rgba(13, 107, 166, 0.1);
  color: var(--dark-color);
}

.kpi-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-icon {
  width: 24px;
  height: 24px;
}

.kpi-content {
  display: flex;
  flex-direction: column;
}

.kpi-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: #777777;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kpi-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-black);
  margin: 0.2rem 0 0 0;
}

/* Responsive Table Container */
.summary-table-section {
  border-radius: 10px;
  border: 1px solid #edf2f7;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.table-responsive-container {
  overflow-x: auto;
  width: 100%;
}

/* Scrollbars for table container */
.table-responsive-container::-webkit-scrollbar {
  height: 6px;
}

.table-responsive-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.table-responsive-container::-webkit-scrollbar-thumb {
  background: var(--background-light);
  border-radius: 4px;
}

.table-responsive-container::-webkit-scrollbar-thumb:hover {
  background: var(--normal-color);
}

/* Table overrides */
.table-customer-summary {
  min-width: 1100px;
}

.table-customer-summary th.sortable-th {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
}

.table-customer-summary th.sortable-th:hover {
  background-color: var(--background);
}

.th-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.sort-icon-holder {
  display: inline-flex;
  align-items: center;
}

.sort-arrow {
  width: 14px;
  height: 14px;
  color: var(--light-color);
}

/* Text alignments & emphasis */
.text-left {
  text-align: left !important;
}

.text-right {
  text-align: right !important;
}

.font-medium {
  font-weight: 500;
}

.font-semibold {
  font-weight: 600;
}

.font-bold {
  font-weight: 700;
}

.collection-pill {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--dark-color-opposite-two);
  background-color: rgba(10, 32, 152, 0.08);
  padding: 4px 8px;
  border-radius: 6px;
  display: inline-block;
}

/* Amount highlights */
.budget-amount {
  color: var(--normal-color);
}

.invoice-amount {
  color: var(--dark-color);
}

.discount-amount {
  color: var(--red-color);
}

/* Footer & pagination row */
.summary-footer-bar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background-color: #ffffff;
  border-top: 1px solid #edf2f7;
  align-items: center;
}

@media (min-width: 768px) {
  .summary-footer-bar {
    flex-direction: row;
    justify-content: space-between;
  }
}

.pagination-info {
  font-size: 0.8rem;
  color: #666666;
}

.buttons-to-show {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.button-outline {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1.5px solid var(--light-border);
  background-color: #ffffff;
  color: var(--text-gray);
  font-size: 0.8rem;
  font-weight: 700;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.button-outline:hover {
  background-color: #f7f9fa;
  border-color: #999;
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.button-primary {
  border: none;
  background-color: var(--dark-color-opposite-two);
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.button-primary:hover {
  background-color: var(--light-color-opposite-two);
}

/* Empty State Styling */
.empty-summary-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  text-align: center;
  background-color: #fafbfd;
  border-radius: 12px;
  border: 1.5px dashed var(--light-border);
}

.empty-icon-wrapper {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: #f1f5f9;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.empty-icon {
  width: 30px;
  height: 30px;
}

.empty-summary-state h4 {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-gray);
  margin: 0 0 0.5rem 0;
}

.empty-summary-state p {
  font-size: 0.82rem;
  color: #666;
  margin: 0;
  max-width: 400px;
}
</style>
