import { useCallback, useState } from 'react'
import { useSession } from 'next-auth/react'
import { captureFrontendError } from '@/lib/frontend-error'
import { NmAuthRequiredError, nmRequest } from '@/lib/notenmanagement/client'
import type { LfViewNote, LfViewResponse } from '@/lib/notenmanagement/types'
import { getStoredToken } from '@/lib/notenmanagement-token'
import { normalizeUsername } from '@/lib/username'

type Params = {
	setError: (message: string | null) => void
}

/**
 * Read-back of an already transferred Lehrfach from Notenmanagement.
 *
 * Opening tries the cached token first and only prompts for a password when
 * there is no usable token, or the server rejects the one we had.
 */
export function useLfView({ setError }: Params) {
	const { data: session } = useSession()

	const [showPasswordDialog, setShowPasswordDialog] = useState(false)
	const [showDataDialog, setShowDataDialog] = useState(false)
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [notes, setNotes] = useState<LfViewNote[] | null>(null)
	const [selectedLfId, setSelectedLfId] = useState<string | null>(null)

	const load = useCallback(
		async (lfId: string, credentials: { username: string; password?: string; token?: string }) => {
			try {
				setLoading(true)
				setError(null)

				const data = await nmRequest<LfViewResponse>(
					'/api/notensammler/transfer/view',
					{ lfId },
					credentials
				)

				if (!data.success || !Array.isArray(data.notes)) {
					throw new Error('Invalid response format')
				}

				setNotes(data.notes)
				setShowPasswordDialog(false)
				setShowDataDialog(true)
			} catch (e) {
				if (e instanceof NmAuthRequiredError) {
					// Cached token was stale and we had no password — ask for one.
					setShowPasswordDialog(true)
					return
				}
				captureFrontendError(e, { location: 'notensammler', type: 'fetch-lf-data' })
				setError(e instanceof Error ? e.message : 'Failed to fetch LF data')
			} finally {
				setLoading(false)
			}
		},
		[setError]
	)

	const open = useCallback(
		(lfId: string) => {
			setSelectedLfId(lfId)
			const defaultUsername = normalizeUsername(session?.user?.name ?? '')
			setUsername(defaultUsername)
			setPassword('')
			setNotes(null)

			const storedToken = getStoredToken()
			if (storedToken && normalizeUsername(storedToken.username) === defaultUsername) {
				void load(lfId, { username: defaultUsername, token: storedToken.token })
			} else {
				setShowPasswordDialog(true)
			}
		},
		[load, session?.user?.name]
	)

	const submitPassword = useCallback(() => {
		if (!selectedLfId || !password) return
		void load(selectedLfId, { username, password })
	}, [load, password, selectedLfId, username])

	return {
		showPasswordDialog,
		setShowPasswordDialog,
		showDataDialog,
		setShowDataDialog,
		username,
		setUsername,
		password,
		setPassword,
		loading,
		notes,
		selectedLfId,
		open,
		submitPassword
	}
}
