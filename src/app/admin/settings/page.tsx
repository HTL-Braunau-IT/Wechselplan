'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface LDAPConfig {
  url: string
  baseDN: string
  username: string
  password: string
  studentsOU: string
}

export default function SettingsPage() {
  const { t } = useTranslation(['admin', 'common'])
  const [config, setConfig] = useState<LDAPConfig>({
    url: '',
    baseDN: '',
    username: '',
    password: '',
    studentsOU: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [, setError] = useState<string | null>(null)
  const [, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    // Load current configuration
    fetch('/api/admin/ldap-config')
      .then(res => res.json())
      .then(data => setConfig(data as LDAPConfig))
      .catch(() => setError(t('settings.errors.loadConfig')))
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
      setSuccess(t('settings.success.configSaved'))
    } catch {
      setError(t('settings.errors.saveConfig'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">{t('settings.title')}</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.ldapConfig')}</CardTitle>
            <CardDescription>
              {t('settings.ldapConfigDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="url">{t('settings.ldapUrl')}</Label>
                  <Input
                    id="url"
                    value={config.url}
                    onChange={e => setConfig(prev => ({ ...prev, url: e.target.value }))}
                    placeholder={t('settings.ldapUrlPlaceholder')}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="baseDN">{t('settings.baseDN')}</Label>
                  <Input
                    id="baseDN"
                    value={config.baseDN}
                    onChange={e => setConfig(prev => ({ ...prev, baseDN: e.target.value }))}
                    placeholder={t('settings.baseDNPlaceholder')}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">{t('settings.username')}</Label>
                  <Input
                    id="username"
                    value={config.username}
                    onChange={e => setConfig(prev => ({ ...prev, username: e.target.value }))}
                    placeholder={t('settings.usernamePlaceholder')}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('settings.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={config.password}
                    onChange={e => setConfig(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={t('settings.passwordPlaceholder')}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="studentsOU">{t('settings.studentsOU')}</Label>
                  <Input
                    id="studentsOU"
                    value={config.studentsOU}
                    onChange={e => setConfig(prev => ({ ...prev, studentsOU: e.target.value }))}
                    placeholder={t('settings.studentsOUPlaceholder')}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? t('settings.saving') : t('settings.saveConfig')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
} 