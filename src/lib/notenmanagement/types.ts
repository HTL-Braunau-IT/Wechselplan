/**
 * Shared Notenmanagement transfer types.
 *
 * These were duplicated between the notensammler and noten pages; keeping one
 * copy means a change to the transfer contract lands in a single place.
 */

export type Semester = 'first' | 'second'

/** Editable note in the preview: 1-5, or a label sent as Note: null with a Kommentar. */
export type EditableNote = 1 | 2 | 3 | 4 | 5 | 'Nicht beurteilt' | 'Gestundet'

export type PreviewStudent = {
	studentId: number
	firstName: string
	lastName: string
	avg: number | null
	note: 1 | 2 | 3 | 4 | 5 | null
	matched: boolean
	matrikelnummer: number | null
	hasNbOrGestunden?: boolean
	/** When note is null: display "Nicht beurteilt" or "Gestundet" */
	nullNoteLabel?: 'Nicht beurteilt' | 'Gestundet'
}

export type NmStudentWithoutGradeOrMatch = {
	Matrikelnummer: number
	Student_ID?: string
	Nachname: string
	Vorname: string
	Klasse?: string
	EMailAdresse1?: string
	EMailAdresse2?: string
}

export type TransferStatus = {
	first: { transferred: boolean; lfId: string | null }
	second: { transferred: boolean; lfId: string | null }
}

export type TransferPreviewResponse = {
	classId: number
	className: string
	subjectName: string
	subjectTruncated: string
	semester: Semester
	teacherCount: number
	students: PreviewStudent[]
	transferStatus?: TransferStatus
	counts: {
		totalStudents: number
		completeStudents: number
		matchedCompleteStudents: number
		unmatchedCompleteStudents: number
	}
	nmStudentsWithoutGradeOrMatch?: NmStudentWithoutGradeOrMatch[]
}

export type TransferResultResponse = {
	success: boolean
	lfId: string
	confirmation: unknown
	sentCount: number
	skipped: {
		completeStudents: number
		unmatchedOrMissingNote: number
	}
}

export type LfViewNote = {
	Matrikelnummer: number
	Nachname: string
	Vorname: string
	Note: number
	Punkte: number
	Kommentar: string
}

export type LfViewResponse = {
	success?: boolean
	notes?: LfViewNote[]
}
