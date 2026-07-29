import { Text, View, StyleSheet } from '@react-pdf/renderer'
import { colors, fonts, groupColor } from '@/lib/pdf/theme'

/**
 * The renderer does not re-export its `Style` type, and `@react-pdf/types` is
 * only a transitive dependency — derive it from a component instead.
 */
type Style = NonNullable<Exclude<React.ComponentProps<typeof View>['style'], readonly unknown[]>>

const styles = StyleSheet.create({
  docTitle: {
    ...fonts.bold,
    fontSize: 15,
    letterSpacing: 0.6,
    color: colors.ink,
  },
  docSubtitle: {
    ...fonts.regular,
    fontSize: 8.5,
    color: colors.muted,
    marginTop: 2,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.brand,
    paddingBottom: 6,
  },
  headerMeta: {
    flexDirection: 'row',
    gap: 14,
  },
  metaLabel: {
    ...fonts.regular,
    fontSize: 6,
    letterSpacing: 0.7,
    color: colors.faint,
    textTransform: 'uppercase',
  },
  metaValue: {
    ...fonts.bold,
    fontSize: 8,
    color: colors.inkSoft,
    marginTop: 1.5,
  },
  sectionLabel: {
    ...fonts.bold,
    fontSize: 7.5,
    letterSpacing: 0.8,
    color: colors.brandInk,
    textTransform: 'uppercase',
  },
  badge: {
    width: 13,
    height: 11,
    borderRadius: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...fonts.bold,
    fontSize: 6.5,
    color: colors.surface,
  },
  footer: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.75,
    borderTopColor: colors.line,
    paddingTop: 4,
  },
  footerText: {
    ...fonts.regular,
    fontSize: 6,
    color: colors.faint,
  },
})

/** One `LABEL / value` pair, used in page headers. */
export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

/** The blue-ruled title bar every document opens with. */
export function PageHeader({
  title,
  subtitle,
  meta,
}: {
  title: string
  subtitle?: string
  meta?: React.ReactNode
}) {
  return (
    <View style={styles.headerBar}>
      <View>
        <Text style={styles.docTitle}>{title}</Text>
        {subtitle ? <Text style={styles.docSubtitle}>{subtitle}</Text> : null}
      </View>
      {meta ? <View style={styles.headerMeta}>{meta}</View> : null}
    </View>
  )
}

export function SectionLabel({ children, style }: { children: string; style?: Style }) {
  return <Text style={style ? [styles.sectionLabel, style] : styles.sectionLabel}>{children}</Text>
}

/** Solid rounded swatch carrying a group number. */
export function GroupBadge({ groupId, style }: { groupId: number; style?: Style }) {
  const palette = groupColor(groupId)
  return (
    <View style={[styles.badge, { backgroundColor: palette.accent }, ...(style ? [style] : [])]}>
      <Text style={styles.badgeText}>{String(groupId)}</Text>
    </View>
  )
}

/** Fixed page footer: generation date on the left, page counter on the right. */
export function PageFooter({ createdAt }: { createdAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Wechselplan · erstellt am {createdAt}</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`}
      />
    </View>
  )
}
