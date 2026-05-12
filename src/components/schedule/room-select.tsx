import { ComboboxSelect } from '@/components/ui/combobox-select'

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
	return (
		<ComboboxSelect
			value={value ?? ''}
			onChange={onChange}
			options={rooms}
			placeholder="Raum auswählen"
		/>
	)
}
