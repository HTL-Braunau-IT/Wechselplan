'use client'

import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/**
 * Notenmanagement sign-in prompt.
 *
 * The transfer wizard and the LF read-back both need one, and both used to
 * carry their own copy of this markup.
 */
export function NmCredentialsDialog({
  open,
  onOpenChange,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  onSubmit,
  loading = false,
  submitLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
  onUsernameChange: (value: string) => void
  password: string
  onPasswordChange: (value: string) => void
  onSubmit: () => void
  loading?: boolean
  submitLabel?: string
}) {
  const { t } = useTranslation()
  const canSubmit = Boolean(username && password) && !loading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('notensammler.nmPasswordTitle', 'Notenmanagement Anmeldung')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'notensammler.nmPasswordDesc',
              'Bitte gib deine Anmeldedaten für Notenmanagement ein.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="text"
            value={username}
            onChange={e => onUsernameChange(e.target.value)}
            placeholder={t('notensammler.username', 'Benutzername')}
            autoComplete="username"
          />
          <Input
            type="password"
            value={password}
            onChange={e => onPasswordChange(e.target.value)}
            placeholder={t('notensammler.password', 'Passwort')}
            autoComplete="current-password"
            onKeyDown={e => {
              if (e.key === 'Enter' && canSubmit) onSubmit()
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Abbrechen')}
          </Button>
          <Button onClick={onSubmit} disabled={!canSubmit}>
            {loading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {t('notensammler.loading', 'Lade...')}
              </>
            ) : (
              (submitLabel ?? t('common.continue', 'Weiter'))
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
