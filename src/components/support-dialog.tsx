'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePathname, useSearchParams } from 'next/navigation'
import { HelpCircle } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { toast } from 'sonner'

export function SupportDialog() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const currentUri = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, message, currentUri }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit support message')
      }

      toast.success(t('support.messageSent'))
      setOpen(false)
      setName('')
      setMessage('')
    } catch (error) {
      toast.error(t('support.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:bg-muted/50">
          <HelpCircle className="h-4 w-4" />
          {t('navigation.support', 'Help & Support')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('support.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              {t('support.name')}
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              required
              placeholder={t('support.namePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="message" className="text-sm font-medium">
              {t('support.message')}
            </label>
            <Textarea
              id="message"
              value={message}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
              required
              placeholder={t('support.messagePlaceholder')}
              rows={4}
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('common.submitting') : t('support.submit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
} 