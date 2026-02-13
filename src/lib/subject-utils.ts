/**
 * Truncates subject name according to the pattern:
 * - "PBE4-Verbindungstechnik 1" → "PBE_4"
 * - "PBE4-Mech. Grundausbildung" → "PBE_4"
 * - "COPR-Elektrotechnik" → "COPR"
 * - "ELWP-Elektrotechnik" → "ELWP_4"
 * - "NWWP-Naturwissenschaften" → "NWWP_4"
 */
export function truncateSubject(subjectName: string): string {
	const parts = subjectName.split('-')
	const prefix = (parts[0] ?? subjectName).trim()

	const regex = /^(.+?)(\d+)$/
	const match = regex.exec(prefix)
	if (match?.[1] && match?.[2]) {
		return `${match[1]}_${match[2]}`
	}

	if (prefix === 'ELWP' || prefix === 'NWWP') {
		return `${prefix}_4`
	}

	return prefix
}

/**
 * Returns the subject key (prefix before underscore in truncated form).
 * Used to group AM/PM into same table when key matches (e.g. PBE_3 and PBE_4 → "PBE").
 */
export function getSubjectKey(subjectName: string): string {
	const truncated = truncateSubject(subjectName)
	const key = truncated.split('_')[0]
	return key ?? truncated
}
