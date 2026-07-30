'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Search, UserRound } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { Teacher } from '@/types/types'

const formatName = (teacher: Teacher) => `${teacher.lastName}, ${teacher.firstName}`

interface TeacherComboboxProps {
  teachers: Teacher[]
  value: number | null
  onChange: (teacherId: number | null) => void
  placeholder: string
  noneLabel: string
  searchPlaceholder: string
  emptyLabel: string
  ariaLabel: string
  loading?: boolean
  disabled?: boolean
}

/**
 * Searchable single-select for picking a teacher from the full roster. The
 * plain Select this replaces forced admins to eyeball a long unfiltered list;
 * here they type to filter and the current choice is always visible on the
 * trigger. Selecting the "none" row clears the assignment.
 */
export function TeacherCombobox({
  teachers,
  value,
  onChange,
  placeholder,
  noneLabel,
  searchPlaceholder,
  emptyLabel,
  ariaLabel,
  loading,
  disabled,
}: TeacherComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  const selected = value != null ? (teachers.find(teacher => teacher.id === value) ?? null) : null

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return teachers
    return teachers.filter(teacher =>
      `${teacher.lastName} ${teacher.firstName} ${teacher.username}`.toLowerCase().includes(q),
    )
  }, [teachers, query])

  // Reset the filter each time the popover closes so it reopens clean.
  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const select = (teacherId: number | null) => {
    onChange(teacherId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={!!disabled || !!loading}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">{selected ? formatName(selected) : placeholder}</span>
          </span>
          {loading ? (
            <Spinner size="sm" className="ml-2 shrink-0" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={event => {
          // Keep focus on the search field rather than the first option.
          event.preventDefault()
        }}
      >
        <div className="relative border-b">
          <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4" />
          <Input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 rounded-none border-0 pl-8 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-60 overflow-auto p-1" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            className="hover:bg-accent hover:text-accent-foreground text-muted-foreground flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm"
            onClick={() => select(null)}
          >
            <span>{noneLabel}</span>
            {value === null && <Check className="h-4 w-4" />}
          </button>
          {filtered.map(teacher => {
            const isSelected = value === teacher.id
            return (
              <button
                key={teacher.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cn(
                  'hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm',
                  isSelected && 'bg-accent text-accent-foreground',
                )}
                onClick={() => select(teacher.id)}
              >
                <span className="truncate">{formatName(teacher)}</span>
                {isSelected && <Check className="ml-2 h-4 w-4 shrink-0" />}
              </button>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">{emptyLabel}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
