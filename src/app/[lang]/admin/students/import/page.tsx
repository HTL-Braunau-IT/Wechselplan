'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'

interface LDAPConfig {
  url: string
  baseDN: string
  username: string
  password: string
  studentsOU: string
}

interface ImportData {
  [className: string]: {
    students: Array<{
      givenName: string
      sn: string
    }>
  }
}

export default function ImportPage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<LDAPConfig>({
    url: '',
    baseDN: '',
    username: '',
    password: '',
    studentsOU: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [importData, setImportData] = useState<ImportData | null>(null)
  const [selectedClasses, setSelectedClasses] = useState<{ [key: string]: boolean }>({})

  useEffect(() => {
    // Load current configuration
    fetch('/api/admin/ldap-config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => setError(t('admin.students.import.errors.generic')))
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
      setSuccess(t('admin.students.import.success.configSaved'))
    } catch (err) {
      setError(t('admin.students.import.errors.saveConfig'))
    } finally {
      setIsLoading(false)
    }
  }

  const handlePreview = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/students/import', {
        method: 'POST'
      })

      if (!response.ok) throw new Error()

      const data = await response.json()
      setImportData(data)
      
      // Initialize all classes as selected
      const initialSelection = Object.keys(data).reduce((acc, className) => {
        acc[className] = true
        return acc
      }, {} as { [key: string]: boolean })
      setSelectedClasses(initialSelection)
    } catch (err) {
      setError(t('admin.students.import.errors.fetchStudents'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const selectedClassNames = Object.entries(selectedClasses)
        .filter(([_, selected]) => selected)
        .map(([className]) => className)

      const response = await fetch('/api/students/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classes: selectedClassNames
        })
      })

      if (!response.ok) throw new Error()

      const data = await response.json()
      setSuccess(t('admin.students.import.success.importComplete', {
        students: data.students,
        classes: data.classes
      }))
      setImportData(null)
      setSelectedClasses({})
    } catch (err) {
      setError(t('admin.students.import.errors.importStudents'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleClassSelection = (className: string, checked: boolean) => {
    setSelectedClasses(prev => ({
      ...prev,
      [className]: checked
    }))
  }

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-2xl font-bold mb-6">{t('admin.students.import.title')}</h1>

      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">{t('admin.students.import.ldapConfig')}</h2>
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <Label htmlFor="url">{t('admin.students.import.ldapUrl')}</Label>
              <Input
                id="url"
                value={config.url}
                onChange={e => setConfig(prev => ({ ...prev, url: e.target.value }))}
                placeholder={t('admin.students.import.ldapUrlPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="baseDN">{t('admin.students.import.baseDN')}</Label>
              <Input
                id="baseDN"
                value={config.baseDN}
                onChange={e => setConfig(prev => ({ ...prev, baseDN: e.target.value }))}
                placeholder={t('admin.students.import.baseDNPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="username">{t('admin.students.import.username')}</Label>
              <Input
                id="username"
                value={config.username}
                onChange={e => setConfig(prev => ({ ...prev, username: e.target.value }))}
                placeholder={t('admin.students.import.usernamePlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="password">{t('admin.students.import.password')}</Label>
              <Input
                id="password"
                type="password"
                value={config.password}
                onChange={e => setConfig(prev => ({ ...prev, password: e.target.value }))}
                placeholder={t('admin.students.import.passwordPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="studentsOU">{t('admin.students.import.studentsOU')}</Label>
              <Input
                id="studentsOU"
                value={config.studentsOU}
                onChange={e => setConfig(prev => ({ ...prev, studentsOU: e.target.value }))}
                placeholder={t('admin.students.import.studentsOUPlaceholder')}
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t('admin.students.import.saving') : t('admin.students.import.saveConfig')}
            </Button>
          </form>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <Button onClick={handlePreview} disabled={isLoading}>
            {isLoading ? t('admin.students.import.loading') : t('admin.students.import.previewData')}
          </Button>

          {importData && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">{t('admin.students.import.previewTitle')}</h2>
              <div className="space-y-4">
                {Object.entries(importData).map(([className, data]) => (
                  <div key={className} className="border rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Checkbox
                        id={`class-${className}`}
                        checked={selectedClasses[className] ?? false}
                        onCheckedChange={(checked) => handleClassSelection(className, checked as boolean)}
                      />
                      <Label htmlFor={`class-${className}`}>
                        {t('admin.students.import.classLabel', { name: className, count: data.students.length })}
                      </Label>
                    </div>
                    <div className="ml-6">
                      <ul className="list-disc list-inside">
                        {data.students.map((student, index) => (
                          <li key={index}>
                            {student.givenName} {student.sn}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={handleImport} disabled={isLoading}>
                {t('admin.students.import.importSelected')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 