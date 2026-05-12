import { ComboboxSelect } from '@/components/ui/combobox-select'

interface Subject {
	id: number
	name: string
}

interface SubjectSelectProps {
	value: string | undefined
	onChange: (value: string) => void
	subjects: Subject[]
}

export function SubjectSelect({ value, onChange, subjects }: SubjectSelectProps) {
	return (
		<ComboboxSelect
			value={value ?? ''}
			onChange={onChange}
			options={subjects}
			placeholder="Fach auswählen"
		/>
	)
}
