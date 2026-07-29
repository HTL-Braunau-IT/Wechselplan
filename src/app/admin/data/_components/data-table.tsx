'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Edit,
  Trash2,
  Search,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { TableSkeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export interface Column {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'textarea'
  options?: { value: string | number; label: string }[]
  required?: boolean
  readonly?: boolean
  sortable?: boolean
  /** When set, this cell is rendered with render(item) instead of the default formatter. Column is omitted from create/edit forms. */
  render?: (item: Record<string, unknown>) => React.ReactNode
}

interface DataTableProps {
  model: string
  columns: Column[]
  data: Record<string, unknown>[]
  onRefresh: () => void
  onEdit: (item: Record<string, unknown>) => Promise<Record<string, unknown>>
  onDelete: (id: number) => Promise<void>
  onCreate: (data: Record<string, unknown>) => Promise<Record<string, unknown>>
  onDeleteAll?: () => Promise<{ deleted?: Record<string, number> } | void>
  deleteAllLabel?: string
  isLoading?: boolean
}

// Helper function to safely convert values to strings
const safeStringify = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'boolean') return value.toString()
  if (typeof value === 'function') return value.toString()
  if (typeof value === 'symbol') return value.toString()
  // This should never be reached due to the type checking above
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value)
}

export function DataTable({
  model,
  columns,
  data,
  onRefresh,
  onEdit,
  onDelete,
  onCreate,
  onDeleteAll,
  deleteAllLabel = `Alle ${model}-Einträge löschen`,
  isLoading = false,
}: DataTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
    null,
  )
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false)
  const [isDeleteAllLoading, setIsDeleteAllLoading] = useState(false)

  const filteredAndSortedData = (() => {
    const filtered = data.filter(item =>
      Object.values(item).some(value =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    )

    if (sortConfig) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key]
        const bValue = b[sortConfig.key]

        // Handle null/undefined values
        if (aValue === null || aValue === undefined) return sortConfig.direction === 'asc' ? 1 : -1
        if (bValue === null || bValue === undefined) return sortConfig.direction === 'asc' ? -1 : 1

        // Handle different data types
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
        }

        if (aValue instanceof Date && bValue instanceof Date) {
          return sortConfig.direction === 'asc'
            ? aValue.getTime() - bValue.getTime()
            : bValue.getTime() - aValue.getTime()
        }

        // String comparison
        const aStr = safeStringify(aValue).toLowerCase()
        const bStr = safeStringify(bValue).toLowerCase()

        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return filtered
  })()

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'

    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }

    setSortConfig({ key, direction })
  }

  const getSortIcon = (key: string) => {
    if (sortConfig?.key !== key) {
      return <ArrowUpDown className="h-4 w-4" />
    }

    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    )
  }

  const handleCreate = () => {
    setFormData({})
    setIsCreateDialogOpen(true)
  }

  const handleEdit = (item: Record<string, unknown>) => {
    setEditingItem(item)
    setFormData(item)
    setIsEditDialogOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editingItem) {
        await onEdit({ ...editingItem, ...formData })
        setIsEditDialogOpen(false)
        setEditingItem(null)
      } else {
        await onCreate(formData)
        setIsCreateDialogOpen(false)
      }
      setFormData({})
      onRefresh()
      toast.success(`${model} ${editingItem ? 'aktualisiert' : 'erstellt'}`)
    } catch {
      toast.error(`${model} konnte nicht ${editingItem ? 'aktualisiert' : 'erstellt'} werden`)
    }
  }

  const handleDelete = async (id: number) => {
    if (confirm(`Möchtest du diesen ${model}-Eintrag wirklich löschen?`)) {
      try {
        await onDelete(id)
        onRefresh()
        toast.success(`${model} erfolgreich gelöscht`)
      } catch {
        toast.error(`${model} konnte nicht gelöscht werden`)
      }
    }
  }

  const handleDeleteAll = async () => {
    if (!onDeleteAll) return
    try {
      setIsDeleteAllLoading(true)
      const result = await onDeleteAll()
      const deletedValues = Object.values(result?.deleted ?? {})
      const totalDeleted = deletedValues.reduce((sum, count) => sum + count, 0)
      toast.success(
        totalDeleted > 0
          ? `${totalDeleted} Einträge gelöscht`
          : `Keine ${model.toLowerCase()}-Einträge wurden gelöscht`,
      )
      setIsDeleteAllDialogOpen(false)
      onRefresh()
    } catch {
      toast.error(`Alle ${model.toLowerCase()}-Einträge konnten nicht gelöscht werden`)
    } finally {
      setIsDeleteAllLoading(false)
    }
  }

  const formatValue = (value: unknown, column: Column) => {
    if (value === null || value === undefined) return '-'

    switch (column.type) {
      case 'date':
        return new Date(value as string | number | Date).toLocaleDateString()
      case 'boolean':
        return value ? 'Ja' : 'Nein'
      case 'select':
        const option = column.options?.find(opt => opt.value === value)
        return option?.label ?? safeStringify(value)
      default:
        return safeStringify(value)
    }
  }

  const renderFormField = (column: Column, id: string) => {
    const value = formData[column.key] ?? ''

    switch (column.type) {
      case 'textarea':
        return (
          <Textarea
            id={id}
            value={safeStringify(value)}
            onChange={e => setFormData(prev => ({ ...prev, [column.key]: e.target.value }))}
            rows={3}
            required={column.required}
            readOnly={column.readonly}
          />
        )
      case 'select':
        return (
          <select
            id={id}
            value={safeStringify(value)}
            onChange={e => setFormData(prev => ({ ...prev, [column.key]: e.target.value }))}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
            required={column.required}
            disabled={column.readonly}
          >
            <option value="">Bitte {column.label} auswählen</option>
            {column.options?.map(option => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        )
      case 'number':
        return (
          <Input
            id={id}
            type="number"
            value={safeStringify(value)}
            onChange={e => setFormData(prev => ({ ...prev, [column.key]: Number(e.target.value) }))}
            required={column.required}
            readOnly={column.readonly}
          />
        )
      case 'date':
        return (
          <Input
            id={id}
            type="datetime-local"
            value={
              value ? new Date(value as string | number | Date).toISOString().slice(0, 16) : ''
            }
            onChange={e =>
              setFormData(prev => ({ ...prev, [column.key]: new Date(e.target.value) }))
            }
            required={column.required}
            readOnly={column.readonly}
          />
        )
      case 'boolean':
        return (
          <Checkbox
            id={id}
            checked={Boolean(value)}
            onCheckedChange={checked =>
              setFormData(prev => ({ ...prev, [column.key]: checked === true }))
            }
            disabled={column.readonly}
          />
        )
      default:
        return (
          <Input
            id={id}
            value={safeStringify(value)}
            onChange={e => setFormData(prev => ({ ...prev, [column.key]: e.target.value }))}
            required={column.required}
            readOnly={column.readonly}
          />
        )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
            <Input
              placeholder="Suchen..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-64 pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Aktualisieren"
            title="Aktualisieren"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {onDeleteAll ? (
            <AlertDialog open={isDeleteAllDialogOpen} onOpenChange={setIsDeleteAllDialogOpen}>
              <Button
                variant="destructive"
                onClick={() => setIsDeleteAllDialogOpen(true)}
                disabled={isLoading || isDeleteAllLoading || data.length === 0}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleteAllLabel}
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Alle {model.toLowerCase()}-Einträge löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Diese Aktion kann nicht rückgängig gemacht werden. Alle aktuell in diesem Tab
                    angezeigten {model.toLowerCase()}-Einträge werden dauerhaft gelöscht.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleteAllLoading}>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={event => {
                      event.preventDefault()
                      void handleDeleteAll()
                    }}
                    disabled={isDeleteAllLoading}
                  >
                    {isDeleteAllLoading ? 'Löschen...' : 'Alle löschen'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {model} hinzufügen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{model} erstellen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {columns
                  .filter(c => !c.render)
                  .map(column => (
                    <div key={column.key} className="space-y-2">
                      <Label htmlFor={`create-${column.key}`}>
                        {column.label}
                        {column.required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      {renderFormField(column, `create-${column.key}`)}
                    </div>
                  ))}
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Abbrechen
                  </Button>
                  <Button onClick={handleSave}>Erstellen</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Bounded height with a sticky header: a 500-row class list used to
          scroll the search box and action buttons off the top of the page. */}
      <div className="max-h-[65vh] overflow-auto rounded-md border">
        {isLoading && data.length === 0 ? (
          <div className="p-4">
            <TableSkeleton columns={Math.min(columns.length + 1, 7)} />
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-background sticky top-0 z-10">
              <TableRow>
                {columns.map(column => (
                  <TableHead
                    key={column.key}
                    className={
                      column.sortable !== false
                        ? 'hover:bg-muted/50 cursor-pointer select-none'
                        : ''
                    }
                    onClick={() => column.sortable !== false && handleSort(column.key)}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{column.label}</span>
                      {column.sortable !== false && getSortIcon(column.key)}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="w-24">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedData.map((item, index) => (
                <TableRow key={(item.id as number) ?? index}>
                  {columns.map(column => (
                    <TableCell key={column.key}>
                      {column.render ? column.render(item) : formatValue(item[column.key], column)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(item)}
                        aria-label="Bearbeiten"
                        title="Bearbeiten"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete((item.id as number) ?? 0)}
                        aria-label="Löschen"
                        title="Löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!isLoading && filteredAndSortedData.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {searchTerm ? 'Keine Treffer für die Suche.' : 'Keine Einträge vorhanden.'}
        </p>
      ) : null}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{model} bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {columns
              .filter(c => !c.render)
              .map(column => (
                <div key={column.key} className="space-y-2">
                  <Label htmlFor={`edit-${column.key}`}>
                    {column.label}
                    {column.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {renderFormField(column, `edit-${column.key}`)}
                </div>
              ))}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleSave}>Änderungen speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
