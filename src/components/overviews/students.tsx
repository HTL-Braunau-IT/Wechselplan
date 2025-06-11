import { useTranslation } from 'react-i18next'

export function StudentOverview() {
    const { t } = useTranslation()
    
    return (
        <h2>{t('overview.studentTitle')}</h2>
    )
}

