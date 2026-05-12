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
}

export function CombineClassesDialog({
	open,
	onOpenChange,
	classes,
	combineClasses,
	onCombineClassesChange,
	onSubmit,
	combining,
}: CombineClassesDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md mx-auto w-[95vw] sm:w-full">
				<DialogHeader className="space-y-3">
					<DialogTitle className="text-xl font-semibold">Klassen zusammenführen</DialogTitle>
					<DialogDescription className="text-sm text-muted-foreground leading-relaxed">
						Erstellen Sie eine neue Klasse durch das Zusammenführen zweier bestehender Klassen
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-6">
					<div className="space-y-5">
						<div className="space-y-2">
							<Label htmlFor="class1" className="text-sm font-medium text-foreground">
								Erste Klasse auswählen
							</Label>
							<Select
								value={combineClasses.class1Id}
								onValueChange={(value) => onCombineClassesChange({ ...combineClasses, class1Id: value })}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Bitte wählen..." />
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
								Zweite Klasse auswählen
							</Label>
							<Select
								value={combineClasses.class2Id}
								onValueChange={(value) => onCombineClassesChange({ ...combineClasses, class2Id: value })}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Bitte wählen..." />
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
								Name der zusammengeführten Klasse
							</Label>
							<Input
								id="combinedClassName"
								value={combineClasses.combinedClassName}
								onChange={(e) => onCombineClassesChange({ ...combineClasses, combinedClassName: e.target.value })}
								placeholder="z.B. 10A+10B"
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
							Abbrechen
						</Button>
						<Button 
							type="submit" 
							disabled={combining}
							className="w-full sm:w-auto"
						>
							{combining ? 'Klassen werden zusammengeführt...' : 'Zusammengeführte Klasse erstellen'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
