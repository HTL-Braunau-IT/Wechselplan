'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Download, Upload, FileDown } from 'lucide-react'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogAction, AlertDialogDescription } from '@/components/ui/alert-dialog'

interface ImportResponse {
	success: boolean
	imported: number
	errors?: number
	validationErrors?: string[]
}

interface ErrorResponse {
	error?: string
	errors?: string[]
}

export default function GradesPage() {
	const [, setFile] = useState<File | null>(null)
	const [error, setError] = useState('')
	const [success, setSuccess] = useState('')
	const [loading, setLoading] = useState(false)
	const [downloading, setDownloading] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [showErrorModal, setShowErrorModal] = useState(false)
	const [errorDetails, setErrorDetails] = useState<string[]>([])

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
				const response = await fetch('/api/admin/grades/import', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						data: content
					}),
				})

				if (!response.ok) {
					const errorData = await response.json() as ErrorResponse
					setError(errorData.error ?? 'Import failed')
					if (errorData.errors) {
						setErrorDetails(errorData.errors)
						setShowErrorModal(true)
					}
					throw new Error('Import failed')
				}

				const result = await response.json() as ImportResponse
				if (result.validationErrors && result.validationErrors.length > 0) {
					setErrorDetails(result.validationErrors)
					setShowErrorModal(true)
				}
				setSuccess(`Successfully imported ${result.imported} grade(s)${result.errors ? ` (${result.errors} errors)` : ''}`)
			} catch (error) {
				setError(error instanceof Error ? error.message : 'Failed to import grades')
			} finally {
				setLoading(false)
			}
		}
		reader.readAsText(selectedFile)
	}

	async function handleDownload() {
		try {
			setDownloading(true)
			setError('')
			setSuccess('')

			const response = await fetch('/api/admin/grades/export')
			if (!response.ok) {
				throw new Error('Failed to download grades')
			}

			const blob = await response.blob()
			const url = window.URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			const contentDisposition = response.headers.get('Content-Disposition')
			const filename = contentDisposition
				? contentDisposition.split('filename=')[1]?.replace(/"/g, '') ?? 'grades_export.csv'
				: 'grades_export.csv'
			a.download = filename
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			window.URL.revokeObjectURL(url)
			setSuccess('Grades exported successfully')
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to download grades')
		} finally {
			setDownloading(false)
		}
	}

	function handleDownloadSample() {
		const csv = 'className,studentUsername,studentFirstName,studentLastName,teacherUsername,teacherFirstName,teacherLastName,semester,grade\nSample Class,student1,John,Doe,teacher1,Jane,Smith,first,3.5'
		const blob = new Blob([csv], { type: 'text/csv' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = 'sample_grades.csv'
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	const handleImportClick = () => {
		fileInputRef.current?.click()
	}

	return (
		<div className="container mx-auto py-6">
			<h1 className="text-2xl font-bold mb-6">Grades Import/Export</h1>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileDown className="h-5 w-5" />
							Export Grades
						</CardTitle>
						<CardDescription>
							Download all grades from all classes as a CSV file
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<Button
								onClick={handleDownload}
								disabled={downloading}
								className="w-full"
							>
								<Download className="h-4 w-4 mr-2" />
								{downloading ? 'Downloading...' : 'Download All Grades'}
							</Button>
							<p className="text-sm text-muted-foreground">
								The CSV file will include: className, studentUsername, studentFirstName, studentLastName, teacherUsername, teacherFirstName, teacherLastName, semester, and grade.
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Upload className="h-5 w-5" />
							Import Grades
						</CardTitle>
						<CardDescription>
							Upload grades from a CSV file
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
									className="hidden"
								/>
								<Button
									onClick={handleImportClick}
									disabled={loading}
									className="flex-1"
								>
									<Upload className="h-4 w-4 mr-2" />
									{loading ? 'Importing...' : 'Import Grades'}
								</Button>
								<Button
									onClick={handleDownloadSample}
									variant="outline"
								>
									<Download className="h-4 w-4 mr-2" />
									Sample
								</Button>
							</div>
							<p className="text-sm text-muted-foreground">
								CSV must include: className, studentUsername, teacherUsername, semester (first/second), and grade (optional, 1-5 in 0.5 increments).
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{error && (
				<Alert variant="destructive" className="mt-6">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{success && (
				<Alert className="mt-6">
					<AlertDescription>{success}</AlertDescription>
				</Alert>
			)}

			<AlertDialog open={showErrorModal} onOpenChange={setShowErrorModal}>
				<AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
					<AlertDialogHeader>
						<AlertDialogTitle>Import Errors</AlertDialogTitle>
						<AlertDialogDescription>
							The following errors occurred during import:
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="py-4">
						<ul className="list-disc list-inside space-y-1 text-sm">
							{errorDetails.map((err, idx) => (
								<li key={idx} className="text-destructive">{err}</li>
							))}
						</ul>
					</div>
					<AlertDialogFooter>
						<AlertDialogAction onClick={() => setShowErrorModal(false)}>OK</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

