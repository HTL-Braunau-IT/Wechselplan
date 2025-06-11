'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, LogIn, LogOut, User } from 'lucide-react'
import { LanguageSwitcher } from '../language-switcher'
import { useTranslation } from 'react-i18next'
import { ThemeToggle } from '~/components/theme-toggle'
import { useSession, signIn, signOut } from 'next-auth/react'
import { Button } from '~/components/ui/button'
import { SupportDialog } from '~/components/support-dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'

/**
 * Renders the application's top navigation header with conditional elements based on user authentication and role.
 *
 * Displays the app logo, support dialog, version and build date, theme and language toggles, and a user menu with login/logout options. For authenticated non-student users, provides a sidebar navigation menu with relevant links.
 *
 * @remark The sidebar navigation menu and menu toggle button are only available to authenticated users whose role is not 'student'.
 */
export function Header() {
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const { t } = useTranslation()
	const { data: session } = useSession()



	const toggleMenu = () => {
		setIsMenuOpen(!isMenuOpen)
	}

	// Only show menu for authenticated non-student users
	const showMenu = session && session.user?.role !== 'student'

	return (
		<header className="fixed top-0 left-0 right-0 z-50 bg-background border-b">
			<div className="container mx-auto px-4">
				<div className="flex items-center justify-between h-16">
					{/* Only show menu button for authenticated non-student users */}
					{showMenu && (
						<button
							onClick={toggleMenu}
							className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none"
							aria-label={t('navigation.menu')}
						>
							<Menu className="h-6 w-6" />
						</button>
					)}
					
					{/* Logo */}
					<Link href="/" className="text-xl font-bold">
						{t('common.appName')}
					</Link>

					<div className="flex items-center space-x-4">
						{/* Support Dialog */}
						<SupportDialog />

						{/* Version Info */}
						<div className="text-xs text-muted-foreground">
							<div>v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}</div>
							<div>
								{process.env.NEXT_PUBLIC_BUILD_DATE 
									? new Date(process.env.NEXT_PUBLIC_BUILD_DATE).toLocaleDateString('de-DE', {
											year: 'numeric',
											month: '2-digit',
											day: '2-digit'
										})
									: 'N/A'}
							</div>
						</div>

						{/* Theme Toggle */}
						<ThemeToggle />

						{/* Language Switcher */}
						<LanguageSwitcher />
						

						{/* User Menu */}
						{session ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" className="relative">
										<User className="h-5 w-5" />
										<span className="sr-only">User menu</span>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuLabel>
										<div className="flex flex-col space-y-1">
											<p className="text-sm font-medium">{session.user?.name}</p>
											<p className="text-xs text-muted-foreground capitalize">
												{session.user?.role}
											</p>
										</div>
									</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => signOut()}>
										<LogOut className="mr-2 h-4 w-4" />
										<span>{t('auth.logout')}</span>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<Button
								variant="ghost"
								size="icon"
								onClick={() => signIn()}
								title={t('auth.login')}
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
									aria-label={t('navigation.closeMenu')}
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
											{t('navigation.home')}
										</Link>
									</li>
									<li>
										<Link
											href="/schedules"
											className="block py-2 hover:text-primary"
											onClick={() => setIsMenuOpen(false)}
										>
											{t('navigation.schedules')}
										</Link>
									</li>
									<li>
										<Link
											href="/students"
											className="block py-2 hover:text-primary"
											onClick={() => setIsMenuOpen(false)}
										>
											{t('navigation.students')}
										</Link>
									</li>
									<li>
										<Link
											href="/schedule/create"
											className="block py-2 hover:text-primary"
											onClick={() => setIsMenuOpen(false)}
										>
											{t('navigation.createSchedule')}
										</Link>
									</li>
									<li>
										<Link
											href="/class-settings"
											className="block py-2 hover:text-primary"
											onClick={() => setIsMenuOpen(false)}
										>
											{t('navigation.classSettings')}
										</Link>
									</li>
									{session?.user?.role === 'teacher' && (
										<li>
											<Link
												href="/admin/students"
												className="block py-2 hover:text-primary"
												onClick={() => setIsMenuOpen(false)}
											>
												{t('navigation.admin')}
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