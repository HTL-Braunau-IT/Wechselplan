'use client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession, signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogIn } from 'lucide-react'
import React from 'react'
import { TeacherOverview } from '@/components/overviews/teacher'
import { StudentOverview } from '@/components/overviews/students'
import { ChangelogDialog } from '@/components/changelog-dialog'
import { useGitHubVersion } from '@/hooks/use-github-version'



/**
 * Renders the home page with authentication-aware and role-based content.
 *
 * Displays a login prompt for unauthenticated users. Authenticated users see a personalized welcome, application version and build date, the current date in German locale, and either a student or teacher overview based on their role.
 */
export default function Home() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const [isChangelogOpen, setIsChangelogOpen] = useState(false)
  const { version, release, loading } = useGitHubVersion()

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold dark:text-white">{t('common.welcome')}</h1>
          <p className="text-lg text-muted-foreground dark:text-gray-400">{t('auth.pleaseLogin')}</p>
          <Button onClick={() => signIn()} size="lg" className="mt-4">
            <LogIn className="mr-2 h-5 w-5" />
            {t('auth.login')}
          </Button>
        </div>
      </div>
    )
  }  

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 max-w-5xl w-full space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold mb-8 dark:text-white">
            {t('common.welcome')}, {session.user?.firstName} {session.user?.lastName}
          </h1>

          <div className="text-sm text-gray-400 dark:text-gray-500">
            <button
              onClick={() => setIsChangelogOpen(true)}
              className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
              title="Click to view changelog"
              disabled={loading || !release}
            >
              Version: v{version.startsWith('v') ? version.slice(1) : version}
            </button>
          </div>
          <ChangelogDialog
            release={release}
            open={isChangelogOpen}
            onOpenChange={setIsChangelogOpen}
          />
        </div>
        <p className="text-lg text-muted-foreground dark:text-gray-400">
            {new Date().toLocaleDateString('de-DE', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        {/* Only show class selector for students */}
        {session.user?.role === 'student' && (
          <StudentOverview />
        )}
        {session.user?.role === 'teacher' && (
          <TeacherOverview />
        )}

       
      </div>
      
    </main>
  )
}
