import { ComboboxSelect } from '@/components/ui/combobox-select'
import { useTranslation } from 'next-i18next'

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
	const { t } = useTranslation('schedule')

	return (
		<ComboboxSelect
			value={value ?? ''}
			onChange={onChange}
			options={learningContents}
			placeholder={t('selectLearningContent')}
		/>
	)
}

