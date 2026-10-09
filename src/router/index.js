import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useSplashStore } from '@/stores/splash.js'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/user/login/LoginView.vue'
import CustomerView from '@/views/customer/CustomerView.vue'
import CustomerDetailView from '@/views/customer/CustomerDetailView.vue'
import CustomerTripView from '@/views/customer/customerTrip/CustomerTripView.vue'
import CustomerTripDetailView from '@/views/customer/customerTrip/CustomerTripDetailView.vue'
import OrderView from '@/views/order/OrderView.vue'
import InvoiceView from '@/views/invoice/InvoiceView.vue'
import ActivityView from '@/views/activity/ActivityView.vue'
import TaskView from '@/views/task/TaskView.vue'
import OrderDetailView from '@/views/order/OrderDetailView.vue'
import InvoiceDetailView from '@/views/invoice/InvoiceDetailView.vue'
import ActivityDetailView from '@/views/activity/ActivityDetailView.vue'
import TaskDetailView from '@/views/task/TaskDetailView.vue'
import TaskFormView from '@/views/task/TaskFormView.vue'
import ActivityFormView from '@/views/activity/ActivityFormView.vue'
import OrderFormView from '@/views/order/OrderFormView.vue'
import InvoiceFormView from '@/views/invoice/InvoiceFormView.vue'
import CustomerTripFormView from '@/views/customer/customerTrip/CustomerTripFormView.vue'
import CustomerFormView from '@/views/customer/CustomerFormView.vue'
import ContactFormView from '@/views/customer/contact/ContactFormView.vue'
import RatingView from '@/views/customer/rating/RatingView.vue'
import RatingFormView from '@/views/customer/rating/RatingFormView.vue'
import AdvanceFormView from '@/views/advance/AdvanceFormView.vue'
import UserFormView from '@/views/user/UserFormView.vue'
import UserDetailView from '@/views/user/UserDetailView.vue'
import PhotoFormView from '@/views/customer/photo/PhotoFormView.vue'
import RestorePasswordView from '@/views/user/login/RestorePasswordView.vue'
import ResetPasswordView from '@/views/user/login/ResetPasswordView.vue'
import UpdatePasswordView from '@/views/user/login/UpdatePasswordView.vue'
import ShipmentView from '@/views/shipment/ShipmentView.vue'
import ShipmentDetailView from '@/views/shipment/ShipmentDetailView.vue'
import ShipmentFormView from '@/views/shipment/ShipmentFormView.vue'
import BulkUploadView from '@/views/bulk/BulkUploadView.vue'
import BulkCreateUpdateCustomerView from '@/views/bulk/formats/BulkCreateUpdateCustomersView.vue'
import BulkCreateUpdateCustomerTripsView from '@/views/bulk/formats/BulkCreateUpdateCustomerTripsView.vue'
import BulkUploadInvoiceDetailsView from '@/views/bulk/formats/BulkUploadInvoiceDetailsView.vue'
import ActivityTypeManagerView from '@/views/activity/ActivityTypeManagerView.vue'
import QueriesView from '@/views/query/QueriesView.vue'
import ClientValidatorQueryView from '@/views/query/formats/ClientValidatorQueryView.vue'
import OrdersWithoutInvoicesQueryView from '@/views/query/formats/OrdersWithoutInvoicesQueryView.vue'
import OrdersWithoutDetailsQueryView from '@/views/query/formats/OrdersWithoutDetailsQueryView.vue'
import InvoicesWithoutDetailsQueryView from '@/views/query/formats/InvoicesWithoutDetailsQueryView.vue'
import CustomerTripsWithoutOrdersQueryView from '@/views/query/formats/CustomerTripsWithoutOrdersQueryView.vue'
import DeletionsView from '@/views/deletions/DeletionsView.vue'

/**
 * Roles con acceso al Módulo Presupuestal (PQ-1): no existen roles literales
 * "gerencia"/"contabilidad" en el CRM; los nombres reales en la BD son
 * 'Gerente' (gerencia) y 'Financiero' (contabilidad). La escala de acceso
 * (`hasPermission`) cubre además a 'Administrador' (all ≥ high).
 */
export const BUDGET_UPLOAD_ROLES = ['Gerente', 'Financiero']

/**
 * Roles que pueden designar la Meta Activa del año (FE-S4-BUDGET-PLANNING
 * §3.3, ASM-9): solo 'Gerente' por nombre + la escala 'high' (Administrador
 * pasa por hasPermission, verificado en `userStore.hasPermission`: jerarquía
 * alto/all). 'Financiero' NO aparece: carga/clona/edita, pero el backend es la
 * autoridad del 403 si force el set-target por API.
 */
export const BUDGET_TARGET_ROLES = ['Gerente']

const canAccessBudgetUpload = () => {
  const userStore = useUserStore()
  return userStore.hasPermission('high') || userStore.hasRole(BUDGET_UPLOAD_ROLES)
}

/** Predicado exportado para vistas/hijos (mismo patrón que el gate de rutas). */
export const canSetBudgetTarget = () => {
  const userStore = useUserStore()
  return userStore.hasPermission('high') || userStore.hasRole(BUDGET_TARGET_ROLES)
}

/**
 * FE-S15-COLLAB (D-FE15-4/D-FE15-5): permiso de EDICIÓN del maestro de
 * colaboradores y del tab de parámetros laborales. La UI solo OCULTA/BLOQUEA:
 * la autoridad real es el allow-list del backend (`COLLAB_VIEW_ROLES` /
 * `COLLAB_EDIT_ROLES`, OQ-BE-2) que refuerza con 403 y con el masking
 * binario `salary_masked` por fila. Mientras el BE no publique los nombres
 * exactos, el FE reutiliza el gate del módulo (high/all + Gerente/Financiero).
 */
export const BUDGET_COLLAB_ROLES = BUDGET_UPLOAD_ROLES

export const canManageCollaborators = () => {
  const userStore = useUserStore()
  return userStore.hasPermission('high') || userStore.hasRole(BUDGET_COLLAB_ROLES)
}

/** RBAC concreto de financiación sigue pendiente en BE; UX comparte el gate presupuestal. */
export const canManageFinancingCredits = () => {
  const userStore = useUserStore()
  return userStore.hasPermission('high') || userStore.hasRole(BUDGET_UPLOAD_ROLES)
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: LoginView
    },
    {
      path: '/restorePassword',
      name: 'RestorePassword',
      component: RestorePasswordView
    },
    {
      path: '/resetPassword/:token',
      name: 'ResetPassword',
      component: ResetPasswordView
    },
    {
      path: '/updatePassword',
      name: 'UpdatePassword',
      component: UpdatePasswordView,
      meta: { requiresAuth: true }
    },
    {
      path: '/',
      name: 'Home',
      component: HomeView,
      meta: { requiresAuth: true }
    },
    {
      path: '/customer',
      name: 'Customer',
      component: CustomerView,
      meta: { requiresAuth: true }
    },
    {
      path: '/customer/:id',
      name: 'CustomerDetail',
      component: CustomerDetailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/customerTrip',
      name: 'CustomerTrip',
      component: CustomerTripView,
      meta: { requiresAuth: true }
    },
    {
      path: '/customerTrip/:id',
      name: 'CustomerTripDetail',
      component: CustomerTripDetailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/order',
      name: 'Order',
      component: OrderView,
      meta: { requiresAuth: true }
    },
    {
      path: '/invoice',
      name: 'Invoice',
      component: InvoiceView,
      meta: { requiresAuth: true }
    },
    {
      path: '/activity',
      name: 'Activity',
      component: ActivityView,
      meta: { requiresAuth: true }
    },
    {
      path: '/task',
      name: 'Task',
      component: TaskView,
      meta: { requiresAuth: true }
    },
    {
      path: '/shipment',
      name: 'Shipment',
      component: ShipmentView,
      meta: { requiresAuth: true }
    },
    {
      path: '/shipment/:id',
      name: 'ShipmentDetail',
      component: ShipmentDetailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/shipmentForm',
      name: 'ShipmentForm',
      component: ShipmentFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/order/:id',
      name: 'OrderDetail',
      component: OrderDetailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/invoice/:id',
      name: 'InvoiceDetail',
      component: InvoiceDetailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/activity/:id',
      name: 'ActivityDetail',
      component: ActivityDetailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/task/:id',
      name: 'TaskDetail',
      component: TaskDetailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/taskForm',
      name: 'TaskForm',
      component: TaskFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/activityForm',
      name: 'ActivityForm',
      component: ActivityFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/orderForm',
      name: 'OrderForm',
      component: OrderFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/invoiceForm',
      name: 'InvoiceForm',
      component: InvoiceFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/customerTripForm',
      name: 'CustomerTripForm',
      component: CustomerTripFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/customerForm',
      name: 'CustomerForm',
      component: CustomerFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/contactForm',
      name: 'ContactForm',
      component: ContactFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/rating/:id',
      name: 'Ratings',
      component: RatingView,
      meta: { requiresAuth: true }
    },
    {
      path: '/ratingForm',
      name: 'RatingForm',
      component: RatingFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/photoForm',
      name: 'PhotoForm',
      component: PhotoFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/advanceForm/:idOrder/:id?',
      name: 'AdvanceForm',
      component: AdvanceFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/bulkUpload/',
      name: 'BulkUpload',
      component: BulkUploadView,
      meta: { requiresAuth: true }
    },
    {
      path: '/bulkUpload/customer/:type',
      name: 'BulkUploadCustomer',
      component: BulkCreateUpdateCustomerView,
      meta: { requiresAuth: true }
    },
    {
      path: '/bulkUpload/customerTrip/:type',
      name: 'BulkUploadCustomerTrip',
      component: BulkCreateUpdateCustomerTripsView,
      meta: { requiresAuth: true }
    },
    {
      path: '/bulkUpload/invoiceDetails',
      name: 'BulkUploadInvoiceDetails',
      component: BulkUploadInvoiceDetailsView,
      meta: { requiresAuth: true }
    },
    {
      path: '/queries',
      name: 'Queries',
      component: QueriesView,
      meta: { requiresAuth: true }
    },
    {
      path: '/queries/customer-validator',
      name: 'ClientValidatorQuery',
      component: ClientValidatorQueryView,
      meta: { requiresAuth: true }
    },
    {
      path: '/queries/orders-without-invoices/:isClosed?',
      name: 'OrdersWithoutInvoicesQuery',
      component: OrdersWithoutInvoicesQueryView,
      meta: { requiresAuth: true }
    },
    {
      path: '/queries/orders-without-details',
      name: 'OrdersWithoutDetailsQuery',
      component: OrdersWithoutDetailsQueryView,
      meta: { requiresAuth: true }
    },
    {
      path: '/queries/invoices-without-details',
      name: 'InvoicesWithoutDetailsQuery',
      component: InvoicesWithoutDetailsQueryView,
      meta: { requiresAuth: true }
    },
    {
      path: '/queries/customer-trips-without-orders/:isClosed?',
      name: 'CustomerTripsWithoutOrdersQuery',
      component: CustomerTripsWithoutOrdersQueryView,
      meta: { requiresAuth: true }
    },
    {
      path: '/deletions',
      name: 'Deletions',
      component: DeletionsView,
      meta: { requiresAuth: true },
      beforeEnter: (to, from, next) => {
        const userStore = useUserStore()
        if (userStore.hasPermission('high')) {
          next()
        } else {
          next('/')
        }
      }
    },

    {
      path: '/userForm/edit-create/:status',
      name: 'UserForm',
      component: UserFormView,
      meta: { requiresAuth: true },
      beforeEnter: (to, from, next) => {
        const validStatuses = ['create', 'me']
        if (validStatuses.includes(to.params.status)) {
          next()
        } else {
          next('/')
        }
      }
    },
    {
      path: '/user/me',
      name: 'UserDetail',
      component: UserDetailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/activity-type/manager',
      name: 'ActivityTypeManager',
      component: ActivityTypeManagerView,
      meta: { requiresAuth: true }
    },
    {
      // Rama del Módulo Presupuestal: layout = App.vue global (el proyecto no
      // usa layouts anidados); hija default 'upload' => Centro de Ingesta.
      path: '/budget',
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: { name: 'BudgetUpload' }
        },
        {
          path: 'upload',
          name: 'BudgetUpload',
          component: () => import('@/views/budget/BudgetUploadsView.vue'),
          meta: { requiresAuth: true },
          beforeEnter: (to, from, next) => {
            // Gateo por rol (PQ-1): solo gerencia/contabilidad (+ high/all);
            // el acceso directo no autorizado se redirige a Home.
            if (canAccessBudgetUpload()) {
              next()
            } else {
              next('/')
            }
          }
        },
        {
          // Hermana del Centro de Ingesta (FE-S3-RULES §3.1): reutiliza el
          // mismo gate de roles; el redirect hijo '' => BudgetUpload no cambia.
          path: 'rules',
          name: 'BudgetRules',
          component: () => import('@/views/budget/BudgetRulesView.vue'),
          meta: { requiresAuth: true },
          beforeEnter: (to, from, next) => {
            next(canAccessBudgetUpload() ? undefined : '/')
          }
        },
        {
          // Planeación y Escenarios (FE-S4-BUDGET-PLANNING §3.1): nieta de
          // /budget tras 'rules'; reutiliza el gate canAccessBudgetUpload.
          path: 'planning',
          name: 'BudgetPlanning',
          component: () => import('@/views/budget/planning/PlanningDashboard.vue'),
          meta: { requiresAuth: true },
          beforeEnter: (to, from, next) => {
            next(canAccessBudgetUpload() ? undefined : '/')
          }
        },
        {
          // Editor del escenario (grid + pivote). :idBudget es numérico; un
          // NaN se resuelve en la vista (toast + replace a BudgetPlanning).
          path: 'planning/:idBudget',
          name: 'BudgetPlanningGrid',
          component: () => import('@/views/budget/planning/BudgetGridEditor.vue'),
          meta: { requiresAuth: true },
          beforeEnter: (to, from, next) => {
            next(canAccessBudgetUpload() ? undefined : '/')
          }
        },
        {
          // FE-S15-COLLAB: maestro de colaboradores (nómina). Cuarta rama de
          // /budget, hermana de upload/rules/planning; reutiliza el gate del
          // módulo (la edición fina la refuerza el BE con COLLAB_*_ROLES).
          path: 'collaborators',
          name: 'BudgetCollaborators',
          component: () => import('@/views/budget/CollaboratorsView.vue'),
          meta: { requiresAuth: true },
          beforeEnter: (to, from, next) => {
            next(canAccessBudgetUpload() ? undefined : '/')
          }
        },
        {
          // FE-S16-FINANCING-CREDITS: deuda financiera empresarial, separada
          // de créditos de cartera. La API conserva la autorización final.
          path: 'financing-credits',
          name: 'financing-credits',
          component: () => import('@/views/budget/FinancingCreditsView.vue'),
          meta: {
            requiresAuth: true,
            breadcrumb: ['Presupuesto', 'Financiación empresarial']
          },
          beforeEnter: (to, from, next) => {
            next(canAccessBudgetUpload() ? undefined : '/')
          }
        }
      ]
    }

    /*    {
      path: '/about',
      name: 'About',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/AboutView.vue'),
      meta: { requiresAuth: true }
    }*/
  ]
})

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  const splashStore = useSplashStore()

  if (from.name === 'Login') {
    splashStore.show()
    setTimeout(() => {
      splashStore.hide()
    }, 1000)
  }

  if (to.meta.requiresAuth && !userStore.token) {
    if (to.name != 'Login') {
      next({ name: 'Login' })
    }
  } else if (userStore.token && !userStore.user) {
    try {
      await userStore.getUserDetails()
      next()
    } catch {
      userStore.logout()
      next({ name: 'Login' })
    }
  } else {
    next()
  }
})

export default router
