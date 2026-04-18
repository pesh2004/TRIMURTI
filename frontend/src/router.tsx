import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { RootLayout } from '@/routes/root'
import { LoginPage } from '@/routes/login'
import { AppLayout } from '@/routes/app-layout'
import { DashboardPage } from '@/routes/dashboard'
import { SettingsPage } from '@/routes/settings'
import { HrEmployeesPage } from '@/routes/hr-employees'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  component: AppLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: DashboardPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings',
  component: SettingsPage,
})

const hrEmployeesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/hr-employees',
  component: HrEmployeesPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayoutRoute.addChildren([dashboardRoute, settingsRoute, hrEmployeesRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
