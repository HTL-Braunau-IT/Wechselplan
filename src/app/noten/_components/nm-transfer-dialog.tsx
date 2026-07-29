'use client'

import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle
} from '@/components/ui/dialog'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { GRADE_CLEAR_VALUE } from '@/lib/grades'
import type { useNmTransfer } from '../_hooks/use-nm-transfer'

/** Notenmanagement only accepts whole marks. */
const TRANSFERABLE_GRADES = [1, 2, 3, 4, 5]

export type NmTransferDialogProps = ReturnType<typeof useNmTransfer>

/**
 * Semester choice → per-student review → transfer.
 *
 * One dialog covers both the single-group and all-groups flows; the only
 * visible difference is the group heading rows, which appear once there is more
 * than one group in scope.
 */
export function NmTransferDialog(props: NmTransferDialogProps) {
	const { t } = useTranslation('common')
	const {
		mode,
		step,
		groups,
		grades,
		excluded,
		saving,
		error,
		showPasswordDialog,
		setShowPasswordDialog,
		username,
		setUsername,
		password,
		setPassword,
		close,
		selectSemester,
		setGrade,
		toggleExcluded,
		submit
	} = props

	const showGroupHeadings = groups.length > 1
	const totalSelected = groups.reduce(
		(count, group) => count + group.students.filter((s) => !excluded.has(s.id)).length,
		0
	)

	return (
		<>
			<Dialog open={step === 'semester'} onOpenChange={(open) => !open && close()}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>
							{t('noten.notenmanagementEintragSemesterTitle', { defaultValue: 'Semester wählen' })}
						</DialogTitle>
						<DialogDescription>
							{mode === 'all'
								? t('noten.notenmanagementEintragAlle', {
										defaultValue: 'Notenmanagement Eintrag – Alle Gruppen'
									})
								: t('noten.notenmanagementEintragSubmit', {
										defaultValue: 'An Notenmanagement übertragen'
									})}
						</DialogDescription>
					</DialogHeader>
					<div className="flex gap-2 pt-2">
						{(['first', 'second'] as const).map((semester) => (
							<Button
								key={semester}
								variant="outline"
								className="flex-1"
								onClick={() => void selectSemester(semester)}
							>
								{semester === 'first'
									? t('noten.uebertragSem1', { defaultValue: '1. Semester' })
									: t('noten.uebertragSem2', { defaultValue: '2. Semester' })}
							</Button>
						))}
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={step === 'list'} onOpenChange={(open) => !open && close()}>
				<DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
					<DialogHeader>
						<DialogTitle>
							{t('noten.notenmanagementEintragListTitle', {
								defaultValue: 'Notenstand – Schülerliste'
							})}
						</DialogTitle>
						<DialogDescription>
							{t('noten.notenmanagementEintragSelected', {
								defaultValue: '{{count}} Schüler werden übertragen.',
								count: totalSelected
							})}
						</DialogDescription>
					</DialogHeader>

					<div className="min-h-0 flex-1 overflow-auto rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[3rem] text-center">
										{t('noten.uebertragen', { defaultValue: 'Übertragen' })}
									</TableHead>
									<TableHead className="w-[200px]">{t('noten.name')}</TableHead>
									<TableHead>{t('noten.gradeBerechnet')}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{groups.map((group) => (
									<Fragment key={group.groupId}>
										{showGroupHeadings && (
											<TableRow className="bg-muted/50">
												<TableCell colSpan={3} className="py-1 text-xs font-semibold">
													{t('noten.gruppe')} {group.groupId}
												</TableCell>
											</TableRow>
										)}
										{group.students.map((student) => {
											const grade = grades[student.id] ?? null
											const isExcluded = excluded.has(student.id)
											// A student with no proposed mark would be transferred blank.
											const isMissing = grade == null && !isExcluded
											return (
												<TableRow
													key={student.id}
													className={cn(
														isExcluded && 'opacity-50',
														!isExcluded && isMissing && 'bg-destructive/10'
													)}
												>
													<TableCell className="text-center">
														<Checkbox
															checked={!isExcluded}
															onCheckedChange={(checked) =>
																toggleExcluded(student.id, checked === true)
															}
															aria-label={t('noten.uebertragen', { defaultValue: 'Übertragen' })}
														/>
													</TableCell>
													<TableCell className="font-medium">
														{student.lastName} {student.firstName}
													</TableCell>
													<TableCell>
														<Select
															disabled={isExcluded}
															value={grade != null ? String(grade) : ''}
															onValueChange={(value) =>
																setGrade(
																	student.id,
																	value === GRADE_CLEAR_VALUE || value === ''
																		? null
																		: parseFloat(value)
																)
															}
														>
															<SelectTrigger
																className={cn('w-24', isMissing && 'border-destructive')}
															>
																<SelectValue
																	placeholder={t('noten.uebertragMissing', { defaultValue: '–' })}
																/>
															</SelectTrigger>
															<SelectContent>
																<SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>
																{TRANSFERABLE_GRADES.map((g) => (
																	<SelectItem key={g} value={String(g)}>
																		{g}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</TableCell>
												</TableRow>
											)
										})}
									</Fragment>
								))}
							</TableBody>
						</Table>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

					<div className="flex justify-end gap-2 pt-2">
						<Button variant="outline" size="sm" onClick={close}>
							{t('common.cancel')}
						</Button>
						<Button
							variant="default"
							size="sm"
							disabled={saving || totalSelected === 0}
							onClick={() => void submit()}
						>
							{saving
								? t('common.saving')
								: t('noten.notenmanagementEintragSubmit', {
										defaultValue: 'An Notenmanagement übertragen'
									})}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>
							{t('noten.notenmanagementLogin', { defaultValue: 'Notenmanagement Anmeldung' })}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 pt-2">
						<Input
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder={t('noten.username', { defaultValue: 'Benutzername' })}
							autoComplete="username"
						/>
						<Input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder={t('noten.password', { defaultValue: 'Passwort' })}
							autoComplete="current-password"
							onKeyDown={(e) => {
								if (e.key === 'Enter' && username && password) void submit()
							}}
						/>
						{error && <p className="text-sm text-destructive">{error}</p>}
					</div>
					<div className="flex justify-end gap-2 pt-2">
						<Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(false)}>
							{t('common.cancel')}
						</Button>
						<Button
							size="sm"
							disabled={!username || !password || saving}
							onClick={() => void submit()}
						>
							{saving ? t('common.saving') : t('common.continue', { defaultValue: 'Weiter' })}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
