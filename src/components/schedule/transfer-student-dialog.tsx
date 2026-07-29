'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Student {
  id: number
  firstName: string
  lastName: string
}

interface ClassOption {
  id: number
  name: string
}

interface AssignmentsResponse {
  assignments: Array<{ groupId: number; studentIds: number[] }>
  unassignedStudents: unknown[]
}

const UNASSIGNED_GROUP_VALUE = 'unassigned'

interface TransferStudentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: Student | null
  currentClassId: number | null
  classes: ClassOption[]
  onConfirm: (targetClassId: number, targetGroupId: number | null) => Promise<void> | void
  transferring: boolean
  t: (key: string, options?: Record<string, unknown>) => string
}

/**
 * Dialog for transferring a student from the currently selected class to a
 * different class and group. Target classes exclude the current class; target
 * groups are loaded on demand from the schedule assignments endpoint and always
 * include an "unassigned" option.
 */
export function TransferStudentDialog({
  open,
  onOpenChange,
  student,
  currentClassId,
  classes,
  onConfirm,
  transferring,
  t,
}: TransferStudentDialogProps) {
  const [targetClassId, setTargetClassId] = useState<string>('')
  const [targetGroup, setTargetGroup] = useState<string>(UNASSIGNED_GROUP_VALUE)
  const [availableGroups, setAvailableGroups] = useState<number[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setTargetClassId('')
      setTargetGroup(UNASSIGNED_GROUP_VALUE)
      setAvailableGroups([])
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!targetClassId) {
      setAvailableGroups([])
      setTargetGroup(UNASSIGNED_GROUP_VALUE)
      return
    }

    let cancelled = false
    setLoadingGroups(true)
    setError(null)
    fetch(`/api/schedules/assignments?classId=${targetClassId}`)
      .then(async res => {
        if (!res.ok) throw new Error('Failed to load groups')
        return res.json() as Promise<AssignmentsResponse>
      })
      .then(data => {
        if (cancelled) return
        const groupIds = Array.from(
          new Set(data.assignments.map(a => a.groupId).filter(gid => gid !== 0)),
        ).sort((a, b) => a - b)
        setAvailableGroups(groupIds)
        setTargetGroup(UNASSIGNED_GROUP_VALUE)
      })
      .catch(() => {
        if (cancelled) return
        setAvailableGroups([])
        setError(t('transferLoadGroupsError'))
      })
      .finally(() => {
        if (!cancelled) setLoadingGroups(false)
      })

    return () => {
      cancelled = true
    }
  }, [targetClassId, t])

  const availableClasses = classes.filter(c => c.id !== currentClassId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const classIdNumber = parseInt(targetClassId, 10)
    if (!classIdNumber || Number.isNaN(classIdNumber)) {
      setError(t('transferSelectClassError'))
      return
    }

    const groupIdNumber = targetGroup === UNASSIGNED_GROUP_VALUE ? null : parseInt(targetGroup, 10)

    try {
      await onConfirm(classIdNumber, groupIdNumber)
    } catch {
      setError(t('transferError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-auto w-[95vw] max-w-md sm:w-full">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl font-semibold">{t('transferStudentTitle')}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            {student
              ? t('transferStudentDescription', {
                  name: `${student.lastName}, ${student.firstName}`,
                })
              : t('transferStudentDescriptionGeneric')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="target-class" className="text-foreground text-sm font-medium">
                {t('targetClass')}
              </Label>
              <Select value={targetClassId} onValueChange={setTargetClassId}>
                <SelectTrigger id="target-class" className="w-full">
                  <SelectValue placeholder={t('pleaseSelect')} />
                </SelectTrigger>
                <SelectContent>
                  {availableClasses.map(cls => (
                    <SelectItem key={cls.id} value={cls.id.toString()}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-group" className="text-foreground text-sm font-medium">
                {t('targetGroup')}
              </Label>
              <Select
                value={targetGroup}
                onValueChange={setTargetGroup}
                disabled={!targetClassId || loadingGroups}
              >
                <SelectTrigger id="target-group" className="w-full">
                  <SelectValue
                    placeholder={loadingGroups ? t('loadingGroups') : t('pleaseSelect')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED_GROUP_VALUE}>{t('unassignedGroup')}</SelectItem>
                  {availableGroups.map(gid => (
                    <SelectItem key={gid} value={gid.toString()}>
                      {t('groupNumber', { number: gid })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && (
              <div className="bg-destructive/10 text-destructive border-destructive/20 rounded-md border p-3 text-sm">
                {error}
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={transferring}
              className="w-full sm:w-auto"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={transferring || !targetClassId}
              className="w-full sm:w-auto"
            >
              {transferring ? t('transferring') : t('transfer')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
