import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useSplashStore } from '@/stores/splash.js'
import HomeView from '@/views/HomeView.vue'
import LoginPage from '@/views/user/LoginView.vue'
import CustomerView from '@/views/customer/CustomerView.vue'
import CustomerDetail from '@/views/customer/CustomerDetailView.vue'
import CustomerTripView from '@/views/customer/customerTrip/CustomerTripView.vue'
import CustomerTripDetail from '@/views/customer/customerTrip/CustomerTripDetailView.vue'
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

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: LoginPage
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
      component: CustomerDetail,
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
      component: CustomerTripDetail,
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
