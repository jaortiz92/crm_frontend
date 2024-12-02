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

if (invoiceStore.isThereInvoice()) {
  invoice.value = invoiceStore.getInvoice()
  isEdit.value = true
} else {
  invoice.value = basicModels.invoice
}

onMounted(async () => {})

const save = async (invoice) => {
  if (!invoice.completed) {
    invoice.execution_date = null
  }

  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Factura')
    if (responseUser.isConfirmed) {
      try {
        const response = await invoiceService.createInvoice(invoice)
        const id = response.data.id_invoice
        alertService.generalSucces(`La Factura fue creadá exitosamente con el ID ${id}`)
        router.push(`invoice/${id}`)
      } catch {
        alertService.generalError(`La Factura no pudo ser creada. Valide ID orden o Llave`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(invoice.id_invoice, 'Factura')
    if (responseUser.isConfirmed) {
      try {
        await invoiceService.updateInvoice(invoice.id_invoice, invoice)
        alertService.generalSucces(
          `La Factura con ID ${invoice.id_invoice}, fue actualizada exitosamente`
        )
        router.push(`invoice/${invoice.id_invoice}`)
      } catch {
        alertService.generalError(
          `La Factura con ID ${invoice.id_invoice}, no pudo ser actualizada`
        )
      }
    }
  }
}
</script>

<template>
  <div>
    <h2>{{ isEdit ? `Actualizar Factura: ID ${invoice.id_invoice}` : 'Crear Factura' }}</h2>
    <InvoiceFrom :initialInvoice="invoice" :isEdit="isEdit" @save="save"></InvoiceFrom>
  </div>
</template>
