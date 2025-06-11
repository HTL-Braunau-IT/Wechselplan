import { useTranslation } from 'react-i18next'

/**
 * Displays a translated heading for the student overview section.
 *
 * The heading text is retrieved using the translation key 'overview.studentTitle'.
 */
export function StudentOverview() {
    const { t } = useTranslation()
    
    return (
        <h2>{t('overview.studentTitle')}</h2>
    )
}

