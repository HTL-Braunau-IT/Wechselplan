import { ComboboxSelect } from '@/components/ui/combobox-select'
import { useTranslation } from 'next-i18next'

interface Room {
	id: number
	name: string
}

interface RoomSelectProps {
	value: string | undefined
	onChange: (value: string) => void
	rooms: Room[]
}

export function RoomSelect({ value, onChange, rooms }: RoomSelectProps) {
	const { t } = useTranslation('schedule')

	return (
		<ComboboxSelect
			value={value ?? ''}
			onChange={onChange}
			options={rooms}
			placeholder={t('selectRoom')}
		/>
	)
}

