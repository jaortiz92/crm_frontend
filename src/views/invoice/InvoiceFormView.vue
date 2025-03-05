<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useInvoiceStore } from '@/stores/invoiceStore'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import InvoiceFrom from '@/components/invoice/InvoiceForm.vue'

import { invoiceService } from '@/services/invoiceService'

const invoice = ref({})
const isEdit = ref(false)
const router = useRouter()
const invoiceStore = useInvoiceStore()
const isLoading = ref(false)

if (invoiceStore.isThereInvoice()) {
  invoice.value = invoiceStore.getInvoice()
  isEdit.value = true
} else {
  invoice.value = basicModels.invoice
}

onMounted(async () => {})

const saveFile = async (id_order, file) => {
  const formData = new FormData()
  formData.append('details', file)
  return await invoiceService.createInvoiceDetails(id_order, formData)
}

const save = async (invoice, file) => {
  if (!invoice.completed) {
    invoice.execution_date = null
  }

  let id
  let invoice_number
  let flag = 0

  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Factura')
    if (responseUser.isConfirmed) {
      isLoading.value = true
      try {
        const response = await invoiceService.createInvoice(invoice)
        id = response.data.id_invoice
        invoice_number = response.data.invoice_number

        alertService.generalSucces(
          `La Factura fue creadá exitosamente con el ID ${id} No. ${invoice_number}`
        )
        flag = 1
      } catch {
        alertService.generalError(`La Factura no pudo ser creada. Valide ID orden o Llave`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(invoice.id_invoice, 'Factura')
    if (responseUser.isConfirmed) {
      isLoading.value = true
      try {
        await invoiceService.updateInvoice(invoice.id_invoice, invoice)
        id = invoice.id_invoice
        invoice_number = invoice.invoice_number
        alertService.generalSucces(
          `La Factura con ID ${invoice.id_invoice} No. ${invoice_number}, fue actualizada exitosamente`
        )
        flag = 1
      } catch {
        alertService.generalError(
          `La Factura con ID ${invoice.id_invoice} No. ${invoice_number}, no pudo ser actualizada`
        )
      }
    }
  }
  if (file) {
    try {
      await saveFile(id, file)
      alertService.generalSucces(
        `Los Detalles para la factura con ID ${id} No. ${invoice_number}, fueron cargados exitosamente`
      )
    } catch {
      alertService.generalError(
        `Los Detalles para la orden con ID ${id} No. ${invoice_number}, no pudieron ser cargados`
      )
    }
  }
  if (flag === 1) {
    router.push(`invoice/${id}`)
  }

  isLoading.value = false
}
</script>

<template>
  <div v-if="isLoading" class="global-loading-overlay">
    <p>Procesando, por favor espere...</p>
    <div class="spinner"></div>
  </div>
  <div>
    <h2>{{ isEdit ? `Actualizar Factura: ID ${invoice.id_invoice}` : 'Crear Factura' }}</h2>
    <InvoiceFrom :initialInvoice="invoice" :isEdit="isEdit" @save="save"></InvoiceFrom>
  </div>
</template>
