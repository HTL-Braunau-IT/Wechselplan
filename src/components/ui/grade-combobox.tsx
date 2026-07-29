'use client'

import * as React from 'react'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './input'
import { Button } from './button'
import {
	GESTUNDEN,
	NICHT_BEURTEILT,
	getGradeDisplayText,
	parseFinalGradeInput,
	parseGradeInput
} from '@/lib/grades'

/**
 * Grade entry field: type a mark directly or pick one from the dropdown.
 *
 * Replaces the near-identical GradeInput and FinalGradeInput components that
 * lived in notensammler/page.tsx. They differed only in which marks they
 * offered and how they parsed input, so that is all the `variant` selects.
 */

type GradeVariant = 'teilnote' | 'endnote'

/** The sentinels lead the list — they are the entries teachers hunt for. */
const SENTINEL_OPTIONS = [
	{ value: String(NICHT_BEURTEILT), label: 'nicht beurteilt' },
	{ value: String(GESTUNDEN), label: 'gestunden' }
]

const TEILNOTE_OPTIONS = [
	...SENTINEL_OPTIONS,
	...['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'].map((v) => ({ value: v, label: v }))
]

const ENDNOTE_OPTIONS = [
	...SENTINEL_OPTIONS,
	...['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))
]

/** Delay before the dropdown closes itself after a valid mark is typed. */
const AUTO_CLOSE_MS = 500
/** Delay on blur so a click on an option still registers. */
const BLUR_CLOSE_MS = 150

export interface GradeComboboxProps {
	value: number | null
	onChange: (value: string) => void
	/** 'teilnote' allows half steps; 'endnote' is whole numbers only. */
	variant?: GradeVariant
	className?: string
	compact?: boolean
	disabled?: boolean
	'aria-label'?: string
}

export function GradeCombobox({
	value,
	onChange,
	variant = 'teilnote',
	className,
	compact,
	disabled,
	'aria-label': ariaLabel
}: GradeComboboxProps) {
	const [isOpen, setIsOpen] = React.useState(false)
	const [inputValue, setInputValue] = React.useState('')
	const inputRef = React.useRef<HTMLInputElement>(null)
	const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

	const options = variant === 'endnote' ? ENDNOTE_OPTIONS : TEILNOTE_OPTIONS
	const parse = variant === 'endnote' ? parseFinalGradeInput : parseGradeInput

	// Reflect external changes (bulk save, refetch) back into the field.
	React.useEffect(() => {
		setInputValue(getGradeDisplayText(value))
	}, [value])

	React.useEffect(() => {
		return () => {
			if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
		}
	}, [])

	const cancelPendingClose = () => {
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current)
			closeTimeoutRef.current = null
		}
	}

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value
		setInputValue(newValue)
		setIsOpen(true)
		cancelPendingClose()

		// Commit as soon as the input is valid — no Enter required.
		const parsed = parse(newValue)
		if (parsed !== null || newValue === '') {
			onChange(newValue)

			if (parsed !== null) {
				closeTimeoutRef.current = setTimeout(() => {
					setIsOpen(false)
					closeTimeoutRef.current = null
				}, AUTO_CLOSE_MS)
			}
		}
	}

	const handleOptionSelect = (optionValue: string) => {
		cancelPendingClose()
		setInputValue(getGradeDisplayText(Number(optionValue)))
		onChange(optionValue)
		setIsOpen(false)
		inputRef.current?.blur()
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape') {
			cancelPendingClose()
			setIsOpen(false)
		} else if (e.key === 'Enter') {
			e.preventDefault()
			cancelPendingClose()
			setIsOpen(false)
		}
	}

	const handleBlur = () => {
		closeTimeoutRef.current = setTimeout(() => {
			setIsOpen(false)
			closeTimeoutRef.current = null
		}, BLUR_CLOSE_MS)
	}

	return (
		<div className={cn('relative', className)}>
			<div className="relative">
				<Input
					ref={inputRef}
					type="text"
					role="combobox"
					aria-expanded={isOpen}
					aria-label={ariaLabel}
					autoComplete="off"
					value={inputValue}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					onFocus={() => setIsOpen(true)}
					onBlur={handleBlur}
					placeholder="-"
					disabled={disabled}
					className={cn(compact ? 'h-7 w-16 pr-7 text-sm' : 'h-8 w-32 pr-8')}
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					tabIndex={-1}
					aria-hidden="true"
					disabled={disabled}
					className={cn(
						'absolute right-0 top-0 h-full py-0 hover:bg-transparent',
						compact ? 'px-1' : 'px-2'
					)}
					onClick={() => {
						setIsOpen(!isOpen)
						inputRef.current?.focus()
					}}
				>
					<ChevronDownIcon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
				</Button>
			</div>

			{isOpen && (
				<div
					className={cn(
						'absolute z-50 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-popover shadow-lg',
						compact ? 'w-36' : 'w-full'
					)}
				>
					<div className="p-1">
						{options.map((option) => {
							const selected = value !== null && value.toString() === option.value
							return (
								<button
									key={option.value}
									type="button"
									className={cn(
										'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
										selected && 'bg-accent text-accent-foreground'
									)}
									onClick={() => handleOptionSelect(option.value)}
								>
									<span>{option.label}</span>
									{selected && <CheckIcon className="h-4 w-4" />}
								</button>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}
