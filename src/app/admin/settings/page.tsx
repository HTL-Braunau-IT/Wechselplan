'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { captureFrontendError } from '@/lib/frontend-error'

interface LDAPConfig {
  url: string
  baseDN: string
  username: string
  password: string
  studentsOU: string
  teachersOU: string
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<LDAPConfig>({
    url: '',
    baseDN: '',
    username: '',
    password: '',
    studentsOU: '',
    teachersOU: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    // Load current configuration
    fetch('/api/admin/ldap-config')
      .then(res => res.json())
      .then(data => setConfig(data as LDAPConfig))
      .catch((err) => {
        console.error('Error loading LDAP config:', err)
        captureFrontendError(err, {
          location: 'admin/settings',
          type: 'load-config'
        })
        setError(t('admin.settings.errors.loadConfig'))
      })
  }, [t])

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/ldap-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })

      if (!response.ok) throw new Error()
      setSuccess(t('admin.settings.ldap.success'))
    } catch (err) {
      console.error('Error saving LDAP config:', err)
      captureFrontendError(err, {
        location: 'admin/settings',
        type: 'save-config',
        extra: {
          config: {
            url: config.url,
            baseDN: config.baseDN,
            studentsOU: config.studentsOU,
            teachersOU: config.teachersOU
          }
        }
      })
      setError(t('admin.settings.ldap.error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.settings.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.settings.ldap.title')}</CardTitle>
              <CardDescription>
                {t('admin.settings.ldap.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="url">{t('admin.settings.ldap.url')}</Label>
                    <Input
                      id="url"
                      name="url"
                      value={config.url}
                      onChange={e => setConfig(prev => ({ ...prev, url: e.target.value }))}
                      placeholder={t('admin.settings.ldap.urlPlaceholder')}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="baseDN">{t('admin.settings.ldap.baseDN')}</Label>
                    <Input
                      id="baseDN"
                      name="baseDN"
                      value={config.baseDN}
                      onChange={e => setConfig(prev => ({ ...prev, baseDN: e.target.value }))}
                      placeholder={t('admin.settings.ldap.baseDNPlaceholder')}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">{t('admin.settings.ldap.username')}</Label>
                    <Input
                      id="username"
                      name="username"
                      value={config.username}
                      onChange={e => setConfig(prev => ({ ...prev, username: e.target.value }))}
                      placeholder={t('admin.settings.ldap.usernamePlaceholder')}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{t('admin.settings.ldap.password')}</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      value={config.password}
                      onChange={e => setConfig(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={t('admin.settings.ldap.passwordPlaceholder')}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="studentsOU">{t('admin.settings.ldap.studentsOU')}</Label>
                    <Input
                      id="studentsOU"
                      name="studentsOU"
                      value={config.studentsOU}
                      onChange={e => setConfig(prev => ({ ...prev, studentsOU: e.target.value }))}
                      placeholder={t('admin.settings.ldap.studentsOUPlaceholder')}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teachersOU">{t('admin.settings.ldap.teachersOU')}</Label>
                    <Input
                      id="teachersOU"
                      name="teachersOU"
                      value={config.teachersOU}
                      onChange={e => setConfig(prev => ({ ...prev, teachersOU: e.target.value }))}
                      placeholder={t('admin.settings.ldap.teachersOUPlaceholder')}
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? t('admin.settings.ldap.saving') : t('admin.settings.ldap.save')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
} 