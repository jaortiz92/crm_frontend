import Swal from 'sweetalert2'

const colors = {
  basicColor: '#141E28',
  errorColor: '#EA4C89',
  succesColor: '#2EA44F',
  cancelColor: '#AAAAAA',
  confirmColor: '#141E28'
}

export const alertService = {
  generalError(text) {
    Swal.fire({
      icon: 'error',
      title: 'Oops...',
      text: `ERROR: ${text}`,
      confirmButtonColor: colors.errorColor
    })
  },
  generalSucces(text) {
    Swal.fire({
      icon: 'success',
      title: 'Completado Exitosamente',
      text: `${text}`,
      confirmButtonColor: colors.succesColor
    })
  },
  generalInformation(textTitle, text) {
    Swal.fire({
      icon: 'info',
      title: textTitle,
      text: `${text}`,
      confirmButtonColor: colors.succesColor
    })
  },
  generalWarning(textTitle, text) {
    Swal.fire({
      icon: 'warning',
      title: textTitle,
      text: `${text}`,
      confirmButtonColor: colors.succesColor
    })
  },
  async generalQuestion(textTitle, text) {
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: colors.confirmColor,
      cancelButtonColor: colors.cancelColor,
      confirmButtonText: 'Si'
    })
    return response
  },
  async editElement(id, element) {
    return await this.generalQuestion(
      `¿Quiere editar el/la ${element}?`,
      `Editará el/la ${element} con ID:<strong>${id}</strong>`
    )
  },
  async createElement(element) {
    return await this.generalQuestion(
      `¿Quiere Crear el/la ${element}?`,
      `Se creará el/la ${element}`
    )
  },
  async updateElement(id, element) {
    return await this.generalQuestion(
      `¿Quiere actualizar el/la ${element}?`,
      `Actualizará ${element} con ID: <strong>${id}</strong>`
    )
  }
}
