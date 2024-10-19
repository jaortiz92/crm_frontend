export const formatters = {
  formatterGeneralNumber: function (value) {
    var formatter = new Intl.NumberFormat('es-US', {})
    return formatter.format(value)
  }
}
