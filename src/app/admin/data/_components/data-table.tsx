'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Edit, Trash2, Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { toast } from 'sonner'

export interface Column {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'textarea'
  options?: { value: string | number; label: string }[]
  required?: boolean
  readonly?: boolean
  sortable?: boolean
}

interface DataTableProps {
  model: string
  columns: Column[]
  data: Record<string, unknown>[]
  onRefresh: () => void
  onEdit: (item: Record<string, unknown>) => Promise<Record<string, unknown>>
  onDelete: (id: number) => Promise<void>
  onCreate: (data: Record<string, unknown>) => Promise<Record<string, unknown>>
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
  isLoading = false
}: DataTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)

  const filteredAndSortedData = (() => {
    const filtered = data.filter(item =>
      Object.values(item).some(value =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
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
          return sortConfig.direction === 'asc' ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime()
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
    
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    
    setSortConfig({ key, direction })
  }

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="h-4 w-4" />
    }
    
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="h-4 w-4" />
      : <ArrowDown className="h-4 w-4" />
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
      toast.success(`${model} ${editingItem ? 'updated' : 'created'} successfully`)
    } catch {
      toast.error(`Failed to ${editingItem ? 'update' : 'create'} ${model}`)
    }
  }

  const handleDelete = async (id: number) => {
    if (confirm(`Are you sure you want to delete this ${model}?`)) {
      try {
        await onDelete(id)
        onRefresh()
        toast.success(`${model} deleted successfully`)
      } catch {
        toast.error(`Failed to delete ${model}`)
      }
    }
  }

  const formatValue = (value: unknown, column: Column) => {
    if (value === null || value === undefined) return '-'
    
    switch (column.type) {
      case 'date':
        return new Date(value as string | number | Date).toLocaleDateString()
      case 'boolean':
        return value ? 'Yes' : 'No'
      case 'select':
        const option = column.options?.find(opt => opt.value === value)
        return option?.label ?? safeStringify(value)
      default:
        return safeStringify(value)
    }
  }

  const renderFormField = (column: Column) => {
    const value = formData[column.key] ?? ''

    switch (column.type) {
      case 'textarea':
        return (
          <textarea
            value={safeStringify(value)}
            onChange={(e) => setFormData(prev => ({ ...prev, [column.key]: e.target.value }))}
            className="w-full p-2 border rounded"
            rows={3}
            required={column.required}
            readOnly={column.readonly}
          />
        )
      case 'select':
        return (
          <select
            value={safeStringify(value)}
            onChange={(e) => setFormData(prev => ({ ...prev, [column.key]: e.target.value }))}
            className="w-full p-2 border rounded"
            required={column.required}
            disabled={column.readonly}
          >
            <option value="">Select {column.label}</option>
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
            type="number"
            value={safeStringify(value)}
            onChange={(e) => setFormData(prev => ({ ...prev, [column.key]: Number(e.target.value) }))}
            required={column.required}
            readOnly={column.readonly}
          />
        )
      case 'date':
        return (
          <Input
            type="datetime-local"
            value={value ? new Date(value as string | number | Date).toISOString().slice(0, 16) : ''}
            onChange={(e) => setFormData(prev => ({ ...prev, [column.key]: new Date(e.target.value) }))}
            required={column.required}
            readOnly={column.readonly}
          />
        )
      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => setFormData(prev => ({ ...prev, [column.key]: e.target.checked }))}
            disabled={column.readonly}
          />
        )
      default:
        return (
          <Input
            value={safeStringify(value)}
            onChange={(e) => setFormData(prev => ({ ...prev, [column.key]: e.target.value }))}
            required={column.required}
            readOnly={column.readonly}
          />
        )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add {model}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create {model}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {columns.map(column => (
                <div key={column.key} className="space-y-2">
                  <label className="text-sm font-medium">
                    {column.label}
                    {column.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {renderFormField(column)}
                </div>
              ))}
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(column => (
                <TableHead 
                  key={column.key}
                  className={column.sortable !== false ? "cursor-pointer hover:bg-muted/50 select-none" : ""}
                  onClick={() => column.sortable !== false && handleSort(column.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                    {column.sortable !== false && getSortIcon(column.key)}
                  </div>
                </TableHead>
              ))}
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedData.map((item, index) => (
              <TableRow key={(item.id as number) ?? index}>
                {columns.map(column => (
                  <TableCell key={column.key}>
                    {formatValue(item[column.key], column)}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(item)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete((item.id as number) ?? 0)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {model}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {columns.map(column => (
              <div key={column.key} className="space-y-2">
                <label className="text-sm font-medium">
                  {column.label}
                  {column.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {renderFormField(column)}
              </div>
            ))}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
