# Especificación Frontend — Planeación Tributaria del Presupuesto 2027

## 1. Objetivo

Agregar al módulo de presupuesto una sección para configurar y visualizar la simulación tributaria de un escenario, comparando régimen ordinario y régimen SIMPLE.

El usuario debe poder entender no solo cuánto impuesto se estima, sino también cuándo se causa, cuándo se declara y cuándo sale el dinero.

## 2. Ubicación y navegación

Agregar una sección dentro de `/budget`:

- `/budget/taxes`
- `/budget/taxes/configuration`
- `/budget/taxes/calendar`
- `/budget/taxes/comparison`
- `/budget/planning/:idBudget/taxes`

La vista del escenario debe ser la principal para consultar el impacto tributario asociado al presupuesto.

Acceso inicial: los mismos roles autorizados del módulo financiero. Las acciones de administración de tarifas y calendarios deben ocultarse o bloquearse según permisos reales del backend.

## 3. Vistas

### 3.1. Configuración tributaria

Formulario para configurar:

- Año fiscal.
- Régimen: ordinario o SIMPLE.
- Municipio principal.
- Actividad económica.
- Responsable de IVA.
- Agente retenedor.
- Agente de reteIVA.
- Agente de reteICA.
- Perfil activo/inactivo.

Debe mostrar advertencia visible:

> Esta simulación es presupuestal y debe ser validada por el responsable tributario de la empresa.

### 3.2. Parámetros del régimen ordinario

Campos para:

- Tarifa de renta.
- Gastos no deducibles.
- Ingresos exentos/no gravados.
- Diferencias fiscales.
- Pérdidas fiscales.
- Descuentos tributarios.
- Anticipos.
- Retenciones sufridas.

### 3.3. Parámetros del régimen SIMPLE

Campos para:

- Grupo o categoría.
- Actividad económica.
- Rango de ingresos.
- Tarifa aplicable.
- Componente territorial, si corresponde.
- Periodicidad de anticipos.

### 3.4. Calendario tributario

Tabla editable por año y régimen con:

- Impuesto.
- Periodo.
- Inicio y fin del periodo.
- Fecha de declaración.
- Fecha de pago.
- Año de pago.
- Estado de configuración.

Debe ser evidente que:

- SIMPLE anticipa pagos durante el mismo año.
- Ordinario causa el impuesto al cierre y normalmente programa el pago al año siguiente.

### 3.5. Panel tributario del presupuesto

Mostrar tarjetas con:

- Impuesto total estimado.
- Saldo tributario pendiente.
- Anticipos.
- Retenciones.
- Próximo vencimiento.
- Salida de caja tributaria del año.

Secciones:

1. Renta/SIMPLE.
2. ReteIVA.
3. Retención en la fuente.
4. ICA.
5. ReteICA.
6. Calendario de pagos.

### 3.6. Comparador de regímenes

Permitir seleccionar dos configuraciones y comparar:

- Base gravable.
- Impuesto causado.
- Anticipos.
- Retenciones.
- Saldo a pagar.
- Total anual.
- Flujo mensual.
- Tasa efectiva de tributación.

El comparador debe resaltar que un mismo total anual puede tener un flujo de caja diferente.

### 3.7. Vista mensual de flujo tributario

Tabla o gráfico con columnas:

- Mes.
- Impuesto causado.
- Anticipos.
- Retenciones.
- Declaraciones.
- Pagos.
- Salida neta de caja.
- Saldo acumulado.

Debe permitir distinguir visualmente pagos del año presupuestado y pagos del año siguiente.

## 4. ReteIVA en frontend

El IVA existente no debe duplicarse ni tener una segunda pantalla de configuración de IVA general.

La interfaz debe mostrar únicamente la integración tributaria:

- IVA generado consultado del motor existente.
- IVA descontable consultado del motor existente.
- ReteIVA calculado por la nueva capa.
- Saldo tributario resultante.
- Fechas de declaración y pago.

ReteIVA no debe sumarse como gasto en el P&G.

## 5. Estados de interfaz

Cada cálculo debe contemplar:

- Cargando.
- Sin perfil tributario.
- Sin tarifas configuradas.
- Sin calendario configurado.
- Datos incompletos.
- Cálculo exitoso.
- Error de validación.
- Error de permisos.
- Error de red.

Cuando falte una tarifa o fecha, mostrar `Sin configurar` y una acción para corregirlo. No mostrar cero silenciosamente.

## 6. Flujo recomendado

1. Usuario abre un escenario presupuestal.
2. Selecciona o crea el perfil tributario.
3. Selecciona régimen ordinario o SIMPLE.
4. Configura los parámetros específicos.
5. Revisa el calendario tributario.
6. Ejecuta el cálculo.
7. Consulta resumen anual y detalle mensual.
8. Clona el escenario para comparar el otro régimen.
9. Abre el comparador.
10. Exporta o imprime el resumen presupuestal.

## 7. Servicios frontend

Crear un servicio dedicado, por ejemplo:

`src/services/budgetTaxService.js`

Debe encapsular:

- Perfiles.
- Tarifas.
- Calendarios.
- Supuestos.
- Cálculos.
- Comparaciones.
- Flujo tributario.

Crear un store dedicado:

`src/stores/budgetTaxStore.js`

El store debe manejar:

- Perfil activo.
- Régimen seleccionado.
- Parámetros.
- Calendario.
- Resultado calculado.
- Comparación.
- Estados de carga y error.

## 8. Formato y precisión

- Mostrar valores monetarios en COP.
- Mantener la precisión recibida del backend.
- Mostrar porcentajes con una cantidad consistente de decimales.
- No recalcular fórmulas tributarias complejas en el frontend.
- El backend es la autoridad del cálculo.
- El frontend solo formatea y visualiza la respuesta.

## 9. Permisos

- Consultar: usuarios autorizados del módulo financiero.
- Editar supuestos: usuarios financieros autorizados.
- Editar tarifas/calendarios: administración financiera.
- Activar perfil tributario: gerente/administrador.

Los botones pueden ocultarse por permisos, pero el backend siempre debe ser la autoridad.

## 10. Criterios de aceptación

1. El usuario puede seleccionar régimen ordinario o SIMPLE.
2. El usuario puede configurar parámetros específicos de cada régimen.
3. El calendario SIMPLE muestra anticipos durante el mismo año.
4. El calendario ordinario muestra el pago del impuesto en el año siguiente.
5. La interfaz diferencia impuesto causado de salida de caja.
6. ReteIVA aparece separado del IVA general.
7. ReteIVA no se suma como gasto en el P&G.
8. Se visualizan retención en la fuente, ICA y reteICA.
9. Se puede comparar régimen ordinario contra SIMPLE.
10. La comparación muestra detalle anual y mensual.
11. Los datos faltantes generan advertencias claras.
12. La pantalla no presenta cero cuando realmente falta configuración.
13. Cambiar de escenario no conserva accidentalmente resultados del escenario anterior.
14. El resultado puede exportarse o imprimirse como soporte presupuestal.
15. El frontend consume el cálculo del backend y no replica la lógica tributaria.

## 11. Recomendaciones de presentación

Usar etiquetas explícitas:

- Impuesto causado.
- Anticipo.
- Retención.
- Saldo por pagar.
- Fecha de declaración.
- Fecha de pago.
- Impacto en utilidad.
- Impacto en caja.

Incluir una nota visible:

> Valores estimados para planeación financiera. Validar con el contador o asesor tributario antes de utilizarlos para obligaciones fiscales reales.

## Enmienda — Visualización bimestral del régimen SIMPLE

La interfaz no debe presentar una tarifa SIMPLE anual única. Debe mostrar un desglose por cada bimestre configurado con:

- Ingresos del bimestre.
- Rango de ingresos aplicado.
- Tarifa utilizada.
- Impuesto causado.
- Anticipos.
- Retenciones.
- Saldo.
- Fecha de declaración.
- Fecha de anticipo o pago.

El resumen anual debe mostrar la suma de los bimestres y debe conservar el detalle que permita explicar por qué un periodo utiliza una tarifa diferente a otro.
