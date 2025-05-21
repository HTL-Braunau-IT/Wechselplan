'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function DeleteAllPage() {
  const { t } = useTranslation(['admin', 'common'])
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      const response = await fetch('/api/students/delete-all', {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete data')
      }

      alert(t('admin.students.deleteAllData.success'))
    } catch (error) {
      console.error('Error deleting data:', error)
      alert(t('admin.students.deleteAllData.error'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">{t('admin.students.deleteAllData.title')}</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.students.deleteAllData.warning')}</CardTitle>
          <CardDescription>
            {t('admin.students.deleteAllData.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting}>
                {isDeleting ? t('admin.students.deleteAllData.deleting') : t('admin.students.deleteAllData.button')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('admin.students.deleteAllData.confirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('admin.students.deleteAllData.confirmDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  {t('admin.students.deleteAllData.confirmButton')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </>
  )
} 