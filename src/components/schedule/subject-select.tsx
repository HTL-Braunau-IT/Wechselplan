import { ComboboxSelect } from '@/components/ui/combobox-select'
import { useTranslation } from 'next-i18next'

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
	const { t } = useTranslation('schedule')

	return (
		<ComboboxSelect
			value={value ?? ''}
			onChange={onChange}
			options={subjects}
			placeholder={t('selectSubject')}
		/>
	)
}

