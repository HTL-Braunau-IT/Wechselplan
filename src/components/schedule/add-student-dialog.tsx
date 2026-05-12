'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NewStudent {
	firstName: string
	lastName: string
	username: string
}

interface AddStudentDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	newStudent: NewStudent
	onStudentChange: (student: NewStudent) => void
	onAdd: (e: React.FormEvent) => void
}

export function AddStudentDialog({
	open,
	onOpenChange,
	newStudent,
	onStudentChange,
	onAdd,
}: AddStudentDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Neuen Schüler hinzufügen</DialogTitle>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid grid-cols-4 items-center gap-4">
						<Label htmlFor="firstName" className="text-right">
							Vorname
						</Label>
						<Input
							id="firstName"
							value={newStudent.firstName}
							onChange={(e) => onStudentChange({ ...newStudent, firstName: e.target.value })}
							className="col-span-3"
						/>
					</div>
					<div className="grid grid-cols-4 items-center gap-4">
						<Label htmlFor="lastName" className="text-right">
							Nachname
						</Label>
						<Input
							id="lastName"
							value={newStudent.lastName}
							onChange={(e) => onStudentChange({ ...newStudent, lastName: e.target.value })}
							className="col-span-3"
						/>
					</div>
					<div className="grid grid-cols-4 items-center gap-4">
						<Label htmlFor="username" className="text-right">
							Benutzername
						</Label>
						<Input
							id="username"
							value={newStudent.username}
							onChange={(e) => onStudentChange({ ...newStudent, username: e.target.value })}
							className="col-span-3"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Abbrechen
					</Button>
					<Button onClick={onAdd}>
						Hinzufügen
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

