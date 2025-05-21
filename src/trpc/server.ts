import "server-only";

import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server'
import { QueryClient } from '@tanstack/react-query'
import superjson from 'superjson'

import { type AppRouter } from '~/server/api/root'

export const api = createTRPCReact<AppRouter>()

export const getBaseUrl = () => {
  if (typeof window !== 'undefined') return '' // browser should use relative url
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}` // SSR should use vercel url
  return `http://localhost:${process.env.PORT ?? 3000}` // dev SSR should use localhost
}

export const getQueryClient = () => {
  const queryClient = new QueryClient()
  return queryClient
}

export const trpcClient = api.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
})

export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>
