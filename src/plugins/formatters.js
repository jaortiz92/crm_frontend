export const formatters = {
  formatterGeneralNumber: function (value) {
    var formatter = new Intl.NumberFormat('es-US', {})
    return formatter.format(value)
  },
  formatterGender: function (value) {
    let result = 'Sin definir'
    if (value == 1) {
      result = 'Masculino'
    } else if (value == 2) {
      result = 'Femenino'
    }
    return result
  },
  formatterPhoneNumber: function (value) {
    const cleaned = ('' + value).replace(/\D/g, '')
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/)
    if (match) {
      return match[1] + '-' + match[2] + '-' + match[3]
    }
    return value
  }
}
