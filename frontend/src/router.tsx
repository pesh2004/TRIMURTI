import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { RootLayout } from '@/routes/root'
import { LoginPage } from '@/routes/login'
import { AppLayout } from '@/routes/app-layout'
import { DashboardPage } from '@/routes/dashboard'
import { SettingsPage } from '@/routes/settings'
import { HrEmployeesPage } from '@/routes/hr-employees'
import { FeaturesPage } from '@/routes/features'
import { ForgotPasswordPage } from '@/routes/forgot-password'
import { PasswordResetPage } from '@/routes/password-reset'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
})

const passwordResetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/password-reset',
  component: PasswordResetPage,
  // `?token=XYZ` comes in via this validator so useSearch() is typed.
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
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

const featuresRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/features',
  component: FeaturesPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  forgotPasswordRoute,
  passwordResetRoute,
  appLayoutRoute.addChildren([dashboardRoute, settingsRoute, hrEmployeesRoute, featuresRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
