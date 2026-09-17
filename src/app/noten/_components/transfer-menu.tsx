'use client'

import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

/**
 * The Notenmanagement "Übertragen" menu: this group, or every group of the
 * class in one pass. Both entries drive the shared `useNmTransfer` dialogs.
 */
export function TransferMenu({
  groupId,
  canTransferAllGroups,
  onTransferGroup,
  onTransferAllGroups,
}: {
  groupId: number | null
  canTransferAllGroups: boolean
  onTransferGroup: () => void
  onTransferAllGroups: () => void
}) {
  const { t } = useTranslation('common')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">
          <Upload className="h-4 w-4" />
          {t('noten.transferShort', { defaultValue: 'Übertragen' })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuItem onSelect={onTransferGroup} disabled={groupId == null}>
          <span className="flex flex-col">
            <span>
              {t('noten.notenmanagementEintragGruppe', {
                n: groupId,
                defaultValue: `Notenmanagement Eintrag Gruppe ${groupId}`,
              })}
            </span>
            <span className="text-muted-foreground text-xs">
              {t('noten.transferGroupDescription', {
                defaultValue: 'Überträgt nur die offene Gruppe.',
              })}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTransferAllGroups} disabled={!canTransferAllGroups}>
          <span className="flex flex-col">
            <span>
              {t('noten.notenmanagementEintragAlle', {
                defaultValue: 'Notenmanagement Eintrag – Alle Gruppen',
              })}
            </span>
            <span className="text-muted-foreground text-xs">
              {t('noten.transferAllDescription', {
                defaultValue: 'Überträgt alle Gruppen dieser Klasse in einem Durchgang.',
              })}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
