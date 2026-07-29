'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export type TextModalContentRef = { getValue(): string }

/**
 * Uncontrolled textarea: the grid re-renders on every keystroke elsewhere, so
 * the draft is read out on close rather than lifted into page state.
 */
const TextModalContent = forwardRef<
	TextModalContentRef,
	{ initialValue: string; placeholder: string }
>(function TextModalContent({ initialValue, placeholder }, ref) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null)

	useImperativeHandle(ref, () => ({
		getValue: () => textareaRef.current?.value ?? ''
	}))

	return (
		<Textarea
			ref={textareaRef}
			defaultValue={initialValue}
			placeholder={placeholder}
			className="min-h-[200px] flex-1 resize-none"
			autoFocus
		/>
	)
})

export type TextModalState =
	| { type: 'notizen'; studentId: number; date: string; period: string }
	| { type: 'lehrstoff'; date: string; period: string }
	| null

/** Editor for a student's Notizen or a day's Lehrstoff. */
export function TextModal({
	state,
	initialValue,
	contentRef,
	onClose
}: {
	state: TextModalState
	initialValue: string
	contentRef: React.RefObject<TextModalContentRef | null>
	onClose: () => void
}) {
	const { t } = useTranslation('common')

	const title =
		state?.type === 'notizen'
			? t('noten.notizen', { defaultValue: 'Notizen' })
			: t('noten.lehrstoff', { defaultValue: 'Lehrstoff' })

	// Remount the textarea per target so it picks up the right initial value.
	const contentKey = state
		? state.type === 'notizen'
			? `notizen-${state.studentId}-${state.date}-${state.period}`
			: `lehrstoff-${state.date}-${state.period}`
		: 'none'

	return (
		<Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="flex max-h-[85vh] max-w-md flex-col">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				{state && (
					<div className="flex min-h-[200px] flex-1 flex-col pt-1">
						<TextModalContent
							ref={contentRef}
							key={contentKey}
							initialValue={initialValue}
							placeholder={title}
						/>
					</div>
				)}
				<div className="flex shrink-0 justify-end gap-2 pt-2">
					<Button variant="outline" size="sm" onClick={onClose}>
						{t('common.save', { defaultValue: 'Speichern' })}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
