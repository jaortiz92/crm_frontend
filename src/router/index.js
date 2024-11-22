import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
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

  if (to.meta.requiresAuth && !userStore.token) {
    if (to.name != 'Login') {
      next({ name: 'Login' })
    }
  } else if (userStore.token && !userStore.user) {
    try {
      await userStore.getUserDetails()
      next()
    } catch {
      console.log('catch')
      next({ name: 'Login' })
    }
  } else {
    next()
  }
})

export default router
