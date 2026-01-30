'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Class {
	id: number
	name: string
	description: string | null
}

interface CombineClassesState {
	class1Id: string
	class2Id: string
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
	t
}: CombineClassesDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md mx-auto w-[95vw] sm:w-full">
				<DialogHeader className="space-y-3">
					<DialogTitle className="text-xl font-semibold">{t('combineClasses')}</DialogTitle>
					<DialogDescription className="text-sm text-muted-foreground leading-relaxed">
						{t('combineClassesDescription')}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-6">
					<div className="space-y-5">
						<div className="space-y-2">
							<Label htmlFor="class1" className="text-sm font-medium text-foreground">
								{t('selectFirstClass')}
							</Label>
							<Select
								value={combineClasses.class1Id}
								onValueChange={(value) => onCombineClassesChange({ ...combineClasses, class1Id: value })}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder={t('pleaseSelect')} />
								</SelectTrigger>
								<SelectContent>
									{classes.map((cls) => (
										<SelectItem key={cls.id} value={cls.id.toString()}>
											{cls.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="class2" className="text-sm font-medium text-foreground">
								{t('selectSecondClass')}
							</Label>
							<Select
								value={combineClasses.class2Id}
								onValueChange={(value) => onCombineClassesChange({ ...combineClasses, class2Id: value })}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder={t('pleaseSelect')} />
								</SelectTrigger>
								<SelectContent>
									{classes.map((cls) => (
										<SelectItem key={cls.id} value={cls.id.toString()}>
											{cls.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="combinedClassName" className="text-sm font-medium text-foreground">
								{t('combinedClassName')}
							</Label>
							<Input
								id="combinedClassName"
								value={combineClasses.combinedClassName}
								onChange={(e) => onCombineClassesChange({ ...combineClasses, combinedClassName: e.target.value })}
								placeholder={t('combinedClassNamePlaceholder')}
								className="w-full"
							/>
						</div>
					</div>
					<DialogFooter className="flex flex-col sm:flex-row gap-3 sm:justify-end">
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
							disabled={combining}
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

