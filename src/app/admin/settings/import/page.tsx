'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'next-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogAction } from '@/components/ui/alert-dialog'

interface ImportData {
	id: number
	name: string
	description?: string | null
	capacity?: number | null
}

interface ImportResponse {
	imported: number
}

interface FetchResponse {
	data: ImportData[]
}

export default function ImportPage() {
	const { t } = useTranslation('admin')
	const [activeTab, setActiveTab] = useState('room')
	const [, setFile] = useState<File | null>(null)
	const [error, setError] = useState('')
	const [success, setSuccess] = useState('')
	const [data, setData] = useState<ImportData[]>([])
	const [loading, setLoading] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [showErrorModal, setShowErrorModal] = useState(false)
	const [, setFriendlyError] = useState('')

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const selectedFile = e.target.files?.[0]
		if (!selectedFile) return

		setFile(selectedFile)
		setError('')
		setSuccess('')

		// Read file content
		const reader = new FileReader()
		reader.onload = async (e) => {
			const content = e.target?.result as string
			if (!content) return

			try {
				setLoading(true)
				const response = await fetch('/api/admin/settings/import', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						type: activeTab,
						data: content
					}),
				})

				if (!response.ok) {
					setFriendlyError(t('errorImportFailed'))
					setShowErrorModal(true)
					throw new Error('Import failed')
				}

				const result = await response.json() as ImportResponse
				setSuccess(t('importSuccess', { count: result.imported }))
				await fetchData()
			} catch (error) {
				setError(error instanceof Error ? error.message : 'Failed to import data')
				setFriendlyError(t('errorImportFailed'))
				setShowErrorModal(true)
			} finally {
				setLoading(false)
			}
		}
		reader.readAsText(selectedFile)
	}

	async function fetchData() {
		try {
			const response = await fetch(`/api/admin/settings/import?type=${activeTab}`)
			if (!response.ok) throw new Error('Failed to fetch data')
			const result = await response.json() as FetchResponse
			setData(result.data)
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to fetch data')
		}
	}

	// Fetch data when tab changes
	useEffect(() => {
		void fetchData()

	}, [activeTab])

	const handleImportClick = () => {
		fileInputRef.current?.click()
	}

	function handleDownloadSample() {
		let csv = ''
		let filename = ''
		switch (activeTab) {
			case 'room':
				csv = 'name,capacity,description\nSample Room,30,Main building room'
				filename = 'sample_rooms.csv'
				break
			case 'subject':
				csv = 'name,description\nMathematics,Math subject description'
				filename = 'sample_subjects.csv'
				break
			case 'learningContent':
				csv = 'name,description\nAlgebra,Algebraic concepts'
				filename = 'sample_learning_content.csv'
				break
		}
		const blob = new Blob([csv], { type: 'text/csv' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = filename
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	return (
		<div className="container mx-auto py-6">
			<h1 className="text-2xl font-bold mb-6">{t('importData')}</h1>

			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<TabsList>
					<TabsTrigger value="room">{t('rooms')}</TabsTrigger>
					<TabsTrigger value="subject">{t('subjects')}</TabsTrigger>
					<TabsTrigger value="learningContent">{t('learningContent')}</TabsTrigger>
				</TabsList>

				<TabsContent value={activeTab}>
					<Card>
						<CardHeader>
							<CardTitle>{t('import' + activeTab.charAt(0).toUpperCase() + activeTab.slice(1))}</CardTitle>
							<CardDescription>
								{t('importDescription', { type: t(activeTab) })}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div className="flex items-center space-x-4">
									<Input
										ref={fileInputRef}
										type="file"
										accept=".csv"
										onChange={handleFileChange}
										disabled={loading}
									/>
									<Button
										onClick={handleImportClick}
										disabled={loading}
									>
										{loading ? t('importing') : t('import')}
									</Button>
									<Button
										onClick={handleDownloadSample}
										variant="outline"
									>
										{t('downloadSample')}
									</Button>
								</div>

								{error && (
									<Alert variant="destructive">
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								)}

								{success && (
									<Alert>
										<AlertDescription>{success}</AlertDescription>
									</Alert>
								)}

								<div className="mt-6">
									<h2 className="text-lg font-semibold mb-4">{t('existingData')}</h2>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>{t('name')}</TableHead>
												{activeTab === 'room' && <TableHead>{t('capacity')}</TableHead>}
												<TableHead>{t('description')}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{data.map((item) => (
												<TableRow key={item.id}>
													<TableCell>{item.name}</TableCell>
													{activeTab === 'room' && (
														<TableCell>{item.capacity}</TableCell>
													)}
													<TableCell>{item.description}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			<AlertDialog open={showErrorModal} onOpenChange={setShowErrorModal}>
				<AlertDialogContent className="bg-white dark:bg-zinc-900">
					<AlertDialogHeader>
						<AlertDialogTitle>{t('error')}</AlertDialogTitle>
					</AlertDialogHeader>
					<div className="py-4">{t('errorImportFailed')}</div>
					<AlertDialogFooter>
						<AlertDialogAction onClick={() => setShowErrorModal(false)}>OK</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
} 