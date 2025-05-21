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
  const { t } = useTranslation()
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
      .catch(() => setError(t('admin.settings.errors.loadConfig')))
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
      setSuccess(t('admin.settings.success.configSaved'))
    } catch {
      setError(t('admin.settings.errors.saveConfig'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-2xl font-bold mb-6">{t('admin.settings.title')}</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.settings.ldapConfig')}</CardTitle>
            <CardDescription>
              {t('admin.settings.ldapConfigDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="url">{t('admin.settings.ldapUrl')}</Label>
                  <Input
                    id="url"
                    value={config.url}
                    onChange={e => setConfig(prev => ({ ...prev, url: e.target.value }))}
                    placeholder={t('admin.settings.ldapUrlPlaceholder')}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="baseDN">{t('admin.settings.baseDN')}</Label>
                  <Input
                    id="baseDN"
                    value={config.baseDN}
                    onChange={e => setConfig(prev => ({ ...prev, baseDN: e.target.value }))}
                    placeholder={t('admin.settings.baseDNPlaceholder')}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">{t('admin.settings.username')}</Label>
                  <Input
                    id="username"
                    value={config.username}
                    onChange={e => setConfig(prev => ({ ...prev, username: e.target.value }))}
                    placeholder={t('admin.settings.usernamePlaceholder')}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('admin.settings.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={config.password}
                    onChange={e => setConfig(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={t('admin.settings.passwordPlaceholder')}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="studentsOU">{t('admin.settings.studentsOU')}</Label>
                  <Input
                    id="studentsOU"
                    value={config.studentsOU}
                    onChange={e => setConfig(prev => ({ ...prev, studentsOU: e.target.value }))}
                    placeholder={t('admin.settings.studentsOUPlaceholder')}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? t('admin.settings.saving') : t('admin.settings.saveConfig')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 