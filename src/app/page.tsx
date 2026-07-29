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
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Renders the home page with authentication-aware and role-based content.
 *
 * Displays a login prompt for unauthenticated users. Authenticated users see a personalized welcome, application version and build date, the current date in German locale, and either a student or teacher overview based on their role.
 */
export default function Home() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const [isChangelogOpen, setIsChangelogOpen] = useState(false)
  const { version, release, allReleases, loading } = useGitHubVersion()

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <h1 className="text-4xl font-bold">{t('common.welcome')}</h1>
          <p className="text-muted-foreground text-lg">{t('auth.pleaseLogin')}</p>
          <Button onClick={() => signIn()} size="lg" className="mt-4">
            <LogIn className="mr-2 h-5 w-5" />
            {t('auth.login')}
          </Button>
        </div>
      </div>
    )
  }

  const localizedDate = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <PageContainer size="wide" className="space-y-8">
      <PageHeader
        title={`${t('common.welcome')}, ${session.user?.firstName} ${session.user?.lastName}`}
        description={localizedDate}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsChangelogOpen(true)}
              title="Click to view changelog"
              disabled={loading || !release}
            >
              Version: v{version.startsWith('v') ? version.slice(1) : version}
            </Button>
            <ChangelogDialog
              release={release}
              allReleases={allReleases}
              open={isChangelogOpen}
              onOpenChange={setIsChangelogOpen}
            />
          </>
        }
      />
      {/* Only show class selector for students */}
      {session.user?.role === 'student' && <StudentOverview />}
      {(session.user?.role === 'teacher' || session.user?.role === 'admin') && <TeacherOverview />}
    </PageContainer>
  )
}
