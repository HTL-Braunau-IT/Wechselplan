'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function ScheduleSubjectsPage() {
	const params = useParams<{ lang: string }>()
	const router = useRouter()
	const searchParams = useSearchParams()
	const lang = params?.lang || 'de'
	const className = searchParams.get('class')

	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	useEffect(() => {
		if (!className) {
			router.push(`/${lang}/schedule/create`)
		}
	}, [className, lang, router])

	if (!className) {
		return null
	}

	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
			<div className="bg-white rounded shadow p-8 w-full max-w-4xl">
				<h1 className="text-2xl font-bold mb-6 text-center">
					Fächer für Klasse {className}
				</h1>
				{loading ? (
					<p>Lade...</p>
				) : error ? (
					<p className="text-red-500">{error}</p>
				) : (
					<div>
						{/* TODO: Add subject selection UI */}
						<p>Subject selection UI will go here</p>
					</div>
				)}
			</div>
		</div>
	)
} 