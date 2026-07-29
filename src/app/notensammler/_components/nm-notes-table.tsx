'use client'

import { useTranslation } from 'react-i18next'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@/components/ui/table'

export type NmNoteRow = {
	Matrikelnummer: number
	Nachname: string
	Vorname: string
	Note: number | null
	Punkte?: number
	Kommentar?: string
}

/**
 * Read-only list of notes as Notenmanagement holds them. Shared by the transfer
 * confirmation and the LF read-back, which rendered identical tables.
 */
export function NmNotesTable({ rows }: { rows: NmNoteRow[] }) {
	const { t } = useTranslation()

	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-20">{t('notensammler.matrikelnummer', 'Matr.')}</TableHead>
						<TableHead>{t('notensammler.lastName', 'Nachname')}</TableHead>
						<TableHead>{t('notensammler.firstName', 'Vorname')}</TableHead>
						<TableHead className="w-16 text-center">{t('notensammler.note', 'Note')}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row, index) => {
						// A null Note is meaningful: the Kommentar carries the reason.
						const noteDisplay =
							row.Note != null
								? String(row.Note)
								: row.Kommentar === 'Nicht beurteilt' || row.Kommentar === 'Gestundet'
									? row.Kommentar
									: t('notensammler.keineNote', 'Keine Note')
						return (
							<TableRow key={row.Matrikelnummer ?? index}>
								<TableCell className="font-mono text-xs">{row.Matrikelnummer}</TableCell>
								<TableCell>{row.Nachname}</TableCell>
								<TableCell>{row.Vorname}</TableCell>
								<TableCell className="text-center font-semibold">{noteDisplay}</TableCell>
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</div>
	)
}
