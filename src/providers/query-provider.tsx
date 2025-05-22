'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export default function QueryProvider({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(() => new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60 * 60, // 1 hour
				gcTime: 1000 * 60 * 60 * 24, // 24 hours
			},
		},
	}))

	return (
		<QueryClientProvider client={queryClient}>
			{children}
		</QueryClientProvider>
	)
} 