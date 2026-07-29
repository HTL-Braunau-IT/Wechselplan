import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
	interface Session {
		user?: {
			id?: string
			name?: string | null
			firstName?: string | null
			lastName?: string | null
			email?: string | null
			image?: string | null
			role?: 'admin' | 'teacher' | 'student'
		}
	}
}

declare module 'next-auth/jwt' {
	interface JWT {
		role?: 'admin' | 'teacher' | 'student' | 'user'
		firstName?: string | null
		lastName?: string | null
		/** Which provider issued this token; drives whether roles are re-resolved. */
		provider?: 'azure-ad' | 'ldap'
		/** Epoch millis of the last Entra membership check, for periodic refresh. */
		accessCheckedAt?: number
	}
}
