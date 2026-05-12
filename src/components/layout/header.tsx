'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Menu, LogIn, LogOut } from 'lucide-react'
import { SchoolYearSelector } from '~/components/school-year-selector'
import { useSession, signIn, signOut } from 'next-auth/react'
import { Button } from '~/components/ui/button'
import { SupportDialog } from '~/components/support-dialog'
import { ChangelogDialog } from '~/components/changelog-dialog'
import { useGitHubVersion } from '~/hooks/use-github-version'
import { useEntitlements } from '~/contexts/entitlements-context'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'

const PROFILE_ROLE_LABELS: Record<string, string> = {
	teacher: 'Lehrer',
	student: 'Schüler',
	admin: 'Administrator',
}

/**
 * Renders the application's top navigation header with dynamic content based on user authentication and role.
 *
 * Displays the app logo, support dialog, version and build date, theme toggle, and a user menu for login or logout. Authenticated users who are not students can access a sidebar navigation menu with links to key sections and, for teachers, an admin area.
 *
 * @remark The sidebar navigation menu and its toggle button are only visible to authenticated users whose role is not 'student'.
 */
export function Header() {
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const [isChangelogOpen, setIsChangelogOpen] = useState(false)
	const { data: session } = useSession()
	const [profileLoaded, setProfileLoaded] = useState(false)
	const [profileError, setProfileError] = useState(false)

	const { isFeatureEnabled } = useEntitlements()
	const { version, release, allReleases, loading } = useGitHubVersion()
	const normalizedVersion = typeof version === 'string' && version.length > 0
		? (version.startsWith('v') ? version.slice(1) : version)
		: '0.0.0'

	const toggleMenu = () => {
		setIsMenuOpen(!isMenuOpen)
	}

	// Only show menu for authenticated non-student users
	const showMenu = session && session.user?.role !== 'student'
	const profileInitials = useMemo(() => {
		const first = session?.user?.firstName?.charAt(0) ?? ''
		const last = session?.user?.lastName?.charAt(0) ?? ''
		return `${first}${last}`.toUpperCase() || session?.user?.name?.charAt(0)?.toUpperCase() || '?'
	}, [session?.user?.firstName, session?.user?.lastName, session?.user?.name])

	const roleLabel = session?.user?.role
		? (PROFILE_ROLE_LABELS[session.user.role] ?? session.user.role)
		: ''

	return (
		<header className="fixed top-4 left-0 right-0 z-50 mx-auto w-[calc(100%-2rem)]  glass border-border/70">
			<div className="px-4">
				<div className="flex items-center justify-between h-16">

					<div className="flex items-center gap-2">
					{/* Only show menu button for authenticated non-student users */}
					{showMenu && (
						<button
							onClick={toggleMenu}
							className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none"
							aria-label="Menü"
						>
							<Menu className="h-6 w-6" />
						</button>
					)}
					
					{/* Logo */}
					<Link href="/" className="text-xl font-bold">
						Wechselplan
					</Link>
					</div>
					
					<div className="flex items-center space-x-4">
					
					{/* School year dropdown */}
					<SchoolYearSelector />

					
						{/* Support Dialog */}
						<SupportDialog />


						{/* User Menu */}
						{session ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" className="relative">
										<span className="inline-flex h-8 w-8 overflow-hidden rounded-full bg-muted">
											<img
												src="/api/me/photo"
												alt=""
												width={32}
												height={32}
												className={`h-full w-full object-cover ${(profileError || !profileLoaded) ? 'hidden' : ''}`}
												onLoad={() => {
													setProfileLoaded(true)
													setProfileError(false)
												}}
												onError={() => setProfileError(true)}
											/>
											{(!profileLoaded || profileError) && (
												<span className="inline-flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
													{profileInitials}
												</span>
											)}
										</span>
										<span className="sr-only">Benutzermenü</span>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuLabel>
										<div className="flex flex-col space-y-1">
											<p className="text-sm font-medium">
												{[session.user?.firstName, session.user?.lastName]
													.filter(Boolean)
													.join(' ') || session.user?.name || session.user?.email || ''}
											</p>
											<p className="text-xs text-muted-foreground">
												{roleLabel}
											</p>
										</div>
									</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => signOut()}>
										<LogOut className="mr-2 h-4 w-4" />
										<span>Abmelden</span>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<Button
								variant="ghost"
								size="icon"
								onClick={() => signIn()}
								title="Anmelden"
							>
								<LogIn className="h-5 w-5" />
							</Button>
						)}
					</div>
				</div>
			</div>

			{/* Navigation Menu - Only show for authenticated non-student users */}
			{showMenu && isMenuOpen && (
				<>
					<div
						className="fixed inset-0 backdrop-blur-sm bg-background/30 z-40"
						onClick={toggleMenu}
					/>
					<div
						className={`fixed top-0 left-0 h-full w-64 bg-background border-r shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
							isMenuOpen ? 'translate-x-0' : '-translate-x-full'
						}`}
					>
						<div className="p-4">
							<div className="flex justify-end">
								<button
									onClick={toggleMenu}
									className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none"
									aria-label="Menü schließen"
								>
									<Menu className="h-6 w-6" />
								</button>
							</div>
							<nav className="mt-8">
								<ul className="space-y-4">
									<li>
										<Link
											href="/"
											className="block py-2 hover:text-primary"
											onClick={() => setIsMenuOpen(false)}
										>
											Startseite
										</Link>
									</li>
									<li>
										<Link
											href="/schedules"
											className="block py-2 hover:text-primary"
											onClick={() => setIsMenuOpen(false)}
										>
											Wechselpläne
										</Link>
									</li>
									{isFeatureEnabled('noten') && (
										<li>
											<Link
												href="/noten"
												className="block py-2 hover:text-primary"
												onClick={() => setIsMenuOpen(false)}
											>
												Notenliste
											</Link>
										</li>
									)}
									<li>
										<Link
											href="/schedule/create"
											className="block py-2 hover:text-primary"
											onClick={() => setIsMenuOpen(false)}
										>
											Wechselplan erstellen
										</Link>
									</li>
									{isFeatureEnabled('notensammler') && (
										<li>
											<Link
												href="/notensammler"
												className="block py-2 hover:text-primary"
												onClick={() => setIsMenuOpen(false)}
											>
												Notensammler
											</Link>
										</li>
									)}
									{(session?.user?.role === 'teacher' || session?.user?.role === 'admin') && (
										<li>
											<Link
												href="/admin/data/students"
												className="block py-2 hover:text-primary"
												onClick={() => setIsMenuOpen(false)}
											>
												Administration
											</Link>
										</li>
									)}
								</ul>
							</nav>
						</div>
					</div>
				</>
			)}
		</header>
	)
}
