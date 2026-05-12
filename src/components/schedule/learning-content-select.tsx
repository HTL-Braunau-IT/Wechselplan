import { ComboboxSelect } from '@/components/ui/combobox-select'

interface LearningContent {
	id: number
	name: string
}

interface LearningContentSelectProps {
	value: string | undefined
	onChange: (value: string) => void
	learningContents: LearningContent[]
}

export function LearningContentSelect({ value, onChange, learningContents }: LearningContentSelectProps) {
	return (
		<ComboboxSelect
			value={value ?? ''}
			onChange={onChange}
			options={learningContents}
			placeholder="Lerninhalt auswählen"
		/>
	)
}
