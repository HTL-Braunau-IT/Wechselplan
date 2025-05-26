'use client'

import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function StudentsPage() {
  const { t } = useTranslation()

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.students.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {t('admin.students.description')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
} 