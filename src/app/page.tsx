'use client'
import { useTranslation } from 'react-i18next'
import { useSession, signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogIn } from 'lucide-react'
import React from 'react'
import { TeacherOverview } from '@/components/overviews/teacher'
import { StudentOverview } from '@/components/overviews/students'



/**
 * Displays the home page with authentication and role-based content.
 *
 * Shows a login prompt if the user is not authenticated. When authenticated, presents a personalized welcome message, application version and build date, the current date in German locale, and renders either the student or teacher overview based on the user's role.
 */
export default function Home() {
  const { t } = useTranslation()
  const { data: session } = useSession()

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
            <div>Version: {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}</div>
            <div>Build: {process.env.NEXT_PUBLIC_BUILD_DATE ? new Date(process.env.NEXT_PUBLIC_BUILD_DATE).toLocaleDateString('de-DE') : 'N/A'}</div>
          </div>
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
