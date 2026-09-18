'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

interface Class {
  id: number
  name: string
  description: string | null
}

interface CombineClassesState {
  memberClassIds: string[]
  combinedClassName: string
}

interface CombineClassesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  classes: Class[]
  combineClasses: CombineClassesState
  onCombineClassesChange: (state: CombineClassesState) => void
  onSubmit: (e: React.FormEvent) => void
  combining: boolean
  t: (key: string) => string
}

export function CombineClassesDialog({
  open,
  onOpenChange,
  classes,
  combineClasses,
  onCombineClassesChange,
  onSubmit,
  combining,
  t,
}: CombineClassesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-auto w-[95vw] max-w-md sm:w-full">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl font-semibold">{t('combineClasses')}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            {t('combineClassesDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">{t('selectClasses')}</Label>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
                {classes.map(cls => {
                  const id = cls.id.toString()
                  const checked = combineClasses.memberClassIds.includes(id)
                  return (
                    <label
                      key={cls.id}
                      htmlFor={`combine-class-${cls.id}`}
                      className="hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm"
                    >
                      <Checkbox
                        id={`combine-class-${cls.id}`}
                        checked={checked}
                        onCheckedChange={value => {
                          const next = value === true
                          const memberClassIds = next
                            ? [...combineClasses.memberClassIds, id]
                            : combineClasses.memberClassIds.filter(x => x !== id)
                          onCombineClassesChange({ ...combineClasses, memberClassIds })
                        }}
                      />
                      <span className="text-foreground">{cls.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="combinedClassName" className="text-foreground text-sm font-medium">
                {t('combinedClassName')}
              </Label>
              <Input
                id="combinedClassName"
                value={combineClasses.combinedClassName}
                onChange={e =>
                  onCombineClassesChange({ ...combineClasses, combinedClassName: e.target.value })
                }
                placeholder={t('combinedClassNamePlaceholder')}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={combining}
              className="w-full sm:w-auto"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                combining ||
                combineClasses.memberClassIds.length < 2 ||
                !combineClasses.combinedClassName.trim()
              }
              className="w-full sm:w-auto"
            >
              {combining ? t('combiningClasses') : t('createCombinedClass')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
