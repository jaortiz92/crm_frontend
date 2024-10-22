import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import HomeView from '@/views/HomeView.vue'
import LoginPage from '@/views/LoginPage.vue'
import CustomerView from '@/views/CustomerView.vue'
import CustomerDetail from '@/views/CustomerDetail.vue'
import CustomerTripView from '@/views/CustomerTripView.vue'
import CustomerTripDetail from '@/views/CustomerTripDetail.vue'

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
