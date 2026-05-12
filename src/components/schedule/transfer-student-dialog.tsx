'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Student {
	id: number
	firstName: string
	lastName: string
}

interface ClassOption {
	id: number
	name: string
}

interface AssignmentsResponse {
	assignments: Array<{ groupId: number; studentIds: number[] }>
	unassignedStudents: unknown[]
}

const UNASSIGNED_GROUP_VALUE = 'unassigned'

interface TransferStudentDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	student: Student | null
	currentClassId: number | null
	classes: ClassOption[]
	onConfirm: (targetClassId: number, targetGroupId: number | null) => Promise<void> | void
	transferring: boolean
}

/**
 * Dialog for transferring a student from the currently selected class to a
 * different class and group. Target classes exclude the current class; target
 * groups are loaded on demand from the schedule assignments endpoint and always
 * include an "unassigned" option.
 */
export function TransferStudentDialog({
	open,
	onOpenChange,
	student,
	currentClassId,
	classes,
	onConfirm,
	transferring,
}: TransferStudentDialogProps) {
	const [targetClassId, setTargetClassId] = useState<string>('')
	const [targetGroup, setTargetGroup] = useState<string>(UNASSIGNED_GROUP_VALUE)
	const [availableGroups, setAvailableGroups] = useState<number[]>([])
	const [loadingGroups, setLoadingGroups] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!open) {
			setTargetClassId('')
			setTargetGroup(UNASSIGNED_GROUP_VALUE)
			setAvailableGroups([])
			setError(null)
		}
	}, [open])

	useEffect(() => {
		if (!targetClassId) {
			setAvailableGroups([])
			setTargetGroup(UNASSIGNED_GROUP_VALUE)
			return
		}

		let cancelled = false
		setLoadingGroups(true)
		setError(null)
		fetch(`/api/schedules/assignments?classId=${targetClassId}`)
			.then(async (res) => {
				if (!res.ok) throw new Error('Failed to load groups')
				return res.json() as Promise<AssignmentsResponse>
			})
			.then((data) => {
				if (cancelled) return
				const groupIds = Array.from(
					new Set(
						data.assignments
							.map((a) => a.groupId)
							.filter((gid) => gid !== 0)
					)
				).sort((a, b) => a - b)
				setAvailableGroups(groupIds)
				setTargetGroup(UNASSIGNED_GROUP_VALUE)
			})
			.catch(() => {
				if (cancelled) return
				setAvailableGroups([])
				setError('Gruppen der Zielklasse konnten nicht geladen werden.')
			})
			.finally(() => {
				if (!cancelled) setLoadingGroups(false)
			})

		return () => {
			cancelled = true
		}
	}, [targetClassId])

	const availableClasses = classes.filter((c) => c.id !== currentClassId)

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setError(null)

		const classIdNumber = parseInt(targetClassId, 10)
		if (!classIdNumber || Number.isNaN(classIdNumber)) {
			setError('Bitte wählen Sie eine Zielklasse aus.')
			return
		}

		const groupIdNumber =
			targetGroup === UNASSIGNED_GROUP_VALUE ? null : parseInt(targetGroup, 10)

		try {
			await onConfirm(classIdNumber, groupIdNumber)
		} catch {
			setError('Schüler konnte nicht verschoben werden.')
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md mx-auto w-[95vw] sm:w-full">
				<DialogHeader className="space-y-3">
					<DialogTitle className="text-xl font-semibold">
						Schüler in andere Klasse verschieben
					</DialogTitle>
					<DialogDescription className="text-sm text-muted-foreground leading-relaxed">
						{student
							? `Verschieben Sie ${student.lastName}, ${student.firstName} in eine andere Klasse. Bestehende Noten bleiben bei der bisherigen Klasse erhalten.`
							: 'Verschieben Sie den Schüler in eine andere Klasse. Bestehende Noten bleiben bei der bisherigen Klasse erhalten.'}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-6">
					<div className="space-y-5">
						<div className="space-y-2">
							<Label htmlFor="target-class" className="text-sm font-medium text-foreground">
								Zielklasse
							</Label>
							<Select value={targetClassId} onValueChange={setTargetClassId}>
								<SelectTrigger id="target-class" className="w-full">
									<SelectValue placeholder="Bitte wählen..." />
								</SelectTrigger>
								<SelectContent>
									{availableClasses.map((cls) => (
										<SelectItem key={cls.id} value={cls.id.toString()}>
											{cls.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="target-group" className="text-sm font-medium text-foreground">
								Zielgruppe
							</Label>
							<Select
								value={targetGroup}
								onValueChange={setTargetGroup}
								disabled={!targetClassId || loadingGroups}
							>
								<SelectTrigger id="target-group" className="w-full">
									<SelectValue
										placeholder={
											loadingGroups ? 'Gruppen werden geladen...' : 'Bitte wählen...'
										}
									/>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNASSIGNED_GROUP_VALUE}>
										Nicht zugewiesen
									</SelectItem>
									{availableGroups.map((gid) => (
										<SelectItem key={gid} value={gid.toString()}>
											Gruppe {gid}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{error && (
							<div className="p-3 bg-destructive/10 text-destructive rounded-md border border-destructive/20 text-sm">
								{error}
							</div>
						)}
					</div>
					<DialogFooter className="flex flex-col sm:flex-row gap-3 sm:justify-end">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={transferring}
							className="w-full sm:w-auto"
						>
							Abbrechen
						</Button>
						<Button
							type="submit"
							disabled={transferring || !targetClassId}
							className="w-full sm:w-auto"
						>
							{transferring ? 'Wird verschoben...' : 'Verschieben'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
