'use client'

import { useTranslation } from 'react-i18next'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import type { Teacher } from '../_lib/types'

/** Confirmation for wiping every grade a teacher recorded in this class. */
export function DeleteTeacherDialog({
	open,
	onOpenChange,
	teacher,
	deleting,
	onConfirm
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	teacher: Teacher | null
	deleting: boolean
	onConfirm: () => void
}) {
	const { t } = useTranslation()

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t('notensammler.deleteTeacherGradesTitle', 'Noten löschen')}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{teacher && (
							<>
								{t(
									'notensammler.deleteTeacherGradesConfirm',
									'Möchtest du wirklich alle Noten für'
								)}{' '}
								<strong>
									{teacher.firstName} {teacher.lastName}
								</strong>{' '}
								{t('notensammler.deleteTeacherGradesConfirm2', 'löschen?')}
								<br />
								<br />
								{t(
									'notensammler.deleteTeacherGradesWarning',
									'Diese Aktion kann nicht rückgängig gemacht werden. Alle Noten für diesen Lehrer in dieser Klasse werden dauerhaft gelöscht.'
								)}
							</>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={deleting}>
						{t('common.cancel', 'Abbrechen')}
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						disabled={deleting}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{deleting ? (
							<>
								<Spinner size="sm" className="mr-2" />
								{t('notensammler.deleting', 'Lösche...')}
							</>
						) : (
							t('notensammler.delete', 'Löschen')
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
