import { clearToken, getStoredToken, storeToken } from '@/lib/notenmanagement-token'
import { normalizeUsername } from '@/lib/username'

/**
 * Single entry point for calls to the Notenmanagement proxy routes.
 *
 * Every one of these endpoints authenticates the same way: reuse a cached
 * bearer token when one is stored for the caller, otherwise send the password;
 * if the server rejects the request, assume the token went stale, drop it and
 * retry once with the password. That ladder used to be written out in full at
 * four call sites across two pages, each with slightly different guards — one
 * retried whenever a token was used, another only when a password happened to
 * be in state, and the error strings differed too.
 */

/** Server envelope shared by every Notenmanagement route. */
type NmEnvelope = {
	error?: string
	details?: unknown
	token?: string
	tokenExpiresIn?: number
}

export class NmError extends Error {
	readonly details: unknown

	constructor(message: string, details?: unknown) {
		super(message)
		this.name = 'NmError'
		this.details = details
	}
}

/**
 * Raised when the stored token was rejected and no password was available to
 * retry with. Callers surface a password prompt rather than an error toast.
 */
export class NmAuthRequiredError extends NmError {
	constructor(message = 'Notenmanagement authentication required') {
		super(message)
		this.name = 'NmAuthRequiredError'
	}
}

/** Build a readable message from an error envelope, including the upstream detail. */
export function formatNmError(data: { error?: string; details?: unknown }): string {
	const detail =
		data.details == null
			? ''
			: typeof data.details === 'string'
				? data.details
				: ((data.details as { error_description?: string })?.error_description ??
					(data.details as { error?: string })?.error ??
					JSON.stringify(data.details))
	return [data.error, detail].filter(Boolean).join(' — ') || 'Transfer failed'
}

export type NmCredentials = {
	username: string
	/** Omitted when the caller only has a cached token (e.g. the LF view shortcut). */
	password?: string
	/**
	 * Use this token instead of looking one up in storage. The LF view resolves
	 * the token itself before deciding whether to prompt.
	 */
	token?: string
}

async function postJson(endpoint: string, body: Record<string, unknown>) {
	const res = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	})
	const data = (await res.json()) as NmEnvelope
	return { res, data }
}

/**
 * POST to a Notenmanagement route, handling token reuse, one password retry and
 * token persistence. Resolves with the response body; throws NmError (or
 * NmAuthRequiredError) otherwise.
 */
export async function nmRequest<T>(
	endpoint: string,
	payload: Record<string, unknown>,
	credentials: NmCredentials
): Promise<T> {
	const username = normalizeUsername(credentials.username) || credentials.username

	const explicitToken = credentials.token
	let storedToken: string | null = explicitToken ?? null
	if (storedToken == null) {
		const stored = getStoredToken()
		if (stored && normalizeUsername(stored.username) === normalizeUsername(username)) {
			storedToken = stored.token
		}
	}

	const persist = (data: NmEnvelope) => {
		if (data.token && data.tokenExpiresIn) {
			storeToken(data.token, data.tokenExpiresIn, username)
		}
	}

	const { res, data } = await postJson(endpoint, {
		...payload,
		username,
		...(storedToken ? { token: storedToken } : { password: credentials.password })
	})

	if (res.ok) {
		persist(data)
		return data as T
	}

	// A rejected request while using a cached token almost always means the
	// token expired. Drop it and fall back to the password once.
	if (storedToken) {
		clearToken()
		if (!credentials.password) {
			throw new NmAuthRequiredError()
		}

		const retry = await postJson(endpoint, {
			...payload,
			username,
			password: credentials.password
		})
		if (!retry.res.ok) {
			throw new NmError(formatNmError(retry.data), retry.data.details)
		}
		persist(retry.data)
		return retry.data as T
	}

	throw new NmError(formatNmError(data), data.details)
}
