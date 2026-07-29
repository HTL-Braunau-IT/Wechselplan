'use client'

import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { EntraUserMappingIssue } from '@/lib/entra-user-mapper'

/**
 * Presentation pieces shared by the directory sync dialogs. Each of these
 * existed twice, in two files, occasionally under two names — the issues table
 * was `ProblemeTable` in one dialog and `IssuesTable` in the other.
 */

/** A tab label with the number of rows behind it. */
export function CountTabTrigger({
  value,
  label,
  count,
}: {
  value: string
  label: string
  count: number
}) {
  return (
    <TabsTrigger value={value} className="gap-1.5">
      <span className="truncate">{label}</span>
      <Badge variant={count > 0 ? 'default' : 'outline'} className="px-1.5 py-0 text-xs">
        {count}
      </Badge>
    </TabsTrigger>
  )
}

export function EmptyState({ text }: { text: string }) {
  return <p className="text-muted-foreground py-8 text-center text-sm">{text}</p>
}

/**
 * Human labels for the field names the diff reports.
 *
 * The dialogs used to render the raw schema identifiers (`firstName`,
 * `username`, `class`) straight into badges, which asks an administrator to
 * read the database schema.
 */
const CHANGE_LABELS: Record<string, string> = {
  firstName: 'Vorname',
  lastName: 'Nachname',
  email: 'E-Mail',
  username: 'Benutzername',
  class: 'Klasse',
  name: 'Name',
  description: 'Beschreibung',
}

export function ChangeBadges({ changes }: { changes: string[] }) {
  if (changes.length === 0) {
    return <span className="text-muted-foreground text-xs">nur Metadaten</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {changes.map(change => (
        <Badge key={change} variant="soft-warning">
          {CHANGE_LABELS[change] ?? change}
        </Badge>
      ))}
    </div>
  )
}

export function AdoptBadge({ willAdopt }: { willAdopt: boolean }) {
  return willAdopt ? (
    <Badge variant="secondary" title="Bestehender Datensatz wird mit Entra verknüpft">
      übernehmen
    </Badge>
  ) : (
    <Badge variant="outline">aktualisieren</Badge>
  )
}

/** Select-all / select-none control for one bucket. */
export function SelectionToolbar({
  total,
  allSelected,
  onSelectAll,
  onSelectNone,
}: {
  total: number
  allSelected: boolean
  onSelectAll: () => void
  onSelectNone: () => void
}) {
  if (total === 0) return null

  return (
    <div className="mb-2 flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={allSelected ? onSelectNone : onSelectAll}
        className="h-7 px-2 text-xs"
      >
        {allSelected ? 'Keine auswählen' : 'Alle auswählen'}
      </Button>
      <span className="text-muted-foreground text-xs">{total} Einträge</span>
    </div>
  )
}

export interface SelectionColumn<T> {
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

/**
 * A table where each row can be included in or excluded from the apply step.
 *
 * Nine near-identical copies of this markup existed across the two dialogs,
 * each repeating the checkbox cell and the setSelection spread by hand.
 */
export function SyncSelectionTable<T>({
  rows,
  columns,
  rowKey,
  selection,
  onToggle,
  onSelectAll,
  allSelected,
}: {
  rows: T[]
  columns: SelectionColumn<T>[]
  rowKey: (row: T) => string | number
  /** Omit to render a read-only table (e.g. the "unchanged" tab). */
  selection?: Record<string, boolean>
  onToggle?: (key: string | number, checked: boolean) => void
  onSelectAll?: (checked: boolean) => void
  allSelected?: boolean
}) {
  const selectable = Boolean(selection && onToggle)

  return (
    <>
      {selectable && onSelectAll ? (
        <SelectionToolbar
          total={rows.length}
          allSelected={Boolean(allSelected)}
          onSelectAll={() => onSelectAll(true)}
          onSelectNone={() => onSelectAll(false)}
        />
      ) : null}
      <Table>
        <TableHeader className="bg-background sticky top-0 z-10">
          <TableRow>
            {selectable ? <TableHead className="w-14">Sync</TableHead> : null}
            {columns.map(column => (
              <TableHead key={column.header}>{column.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => {
            const key = rowKey(row)
            return (
              <TableRow key={key}>
                {selectable ? (
                  <TableCell>
                    <Checkbox
                      checked={selection?.[String(key)] ?? true}
                      onCheckedChange={checked => onToggle?.(key, Boolean(checked))}
                    />
                  </TableCell>
                ) : null}
                {columns.map(column => (
                  <TableCell key={column.header} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </>
  )
}

export function IssuesTable({ issues }: { issues: EntraUserMappingIssue[] }) {
  return (
    <Table>
      <TableHeader className="bg-background sticky top-0 z-10">
        <TableRow>
          <TableHead>Entra-Objekt-ID</TableHead>
          <TableHead>UPN</TableHead>
          <TableHead>Anzeigename</TableHead>
          <TableHead>Grund</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((issue, index) => (
          <TableRow key={`${issue.oid ?? 'ohne-id'}-${index}`}>
            <TableCell className="font-mono text-xs">{issue.oid ?? '–'}</TableCell>
            <TableCell className="font-mono text-xs">{issue.upn ?? '–'}</TableCell>
            <TableCell>{issue.displayName ?? '–'}</TableCell>
            <TableCell>{issue.reason}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Monospaced cell for identifiers, used for oids and usernames. */
export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs">{children ?? '–'}</span>
}
