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
  className?: string
}

export function LearningContentSelect({
  value,
  onChange,
  learningContents,
  className,
}: LearningContentSelectProps) {
  const { t } = useTranslation('schedule')

  return (
    <ComboboxSelect
      value={value ?? ''}
      onChange={onChange}
      options={learningContents}
      placeholder={t('selectLearningContent')}
      className={className}
    />
  )
}
