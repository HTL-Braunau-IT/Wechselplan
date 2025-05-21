'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useRouter } from 'next/navigation'

interface DeleteAllPageProps {
  params: {
    lang: string
  }
}

export default function DeleteAllPage({ params }: DeleteAllPageProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      const response = await fetch('/api/students/delete-all', {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete data')
      }

      alert('All data has been deleted successfully')
      router.push(`/${params.lang}/admin/students`)
    } catch (error) {
      console.error('Error deleting data:', error)
      alert('An error occurred while deleting the data')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Delete All Data</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600 mb-6">
          This action will permanently delete all students and classes. This action cannot be undone.
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete All Data'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete all students and classes from the database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Delete All Data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
} 