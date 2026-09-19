'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { colors } from '@/lib/pdf/palette'
import type { KlassenlisteData, KlassenlistePerson, WritingSpace } from '../_lib/types'
import { UNGROUPED_SECTION_ID } from '../_lib/types'
import { sectionColor, sectionTitle } from '../_lib/section-color'

// A4 portrait at 96dpi. The sheet is drawn at these fixed pixel dimensions and
// scaled to fit its container, so the preview matches the printed proportions.
const SHEET_W = 794
const SHEET_H = 1123
const MAX_SCALE = 0.72
const TICKS = Array.from({ length: 10 })

const personName = (p: KlassenlistePerson) => `${p.lastName} ${p.firstName}`

/** The blank writing area to the right of each name. */
function WriteArea({ space }: { space: WritingSpace }) {
  if (space === 'blank') return null
  if (space === 'notes') return <div style={{ flex: 1, borderLeft: `1px solid ${colors.line}` }} />
  if (space === 'split') {
    return (
      <div style={{ display: 'flex', flex: 1, borderLeft: `1px solid ${colors.line}` }}>
        {TICKS.map((_, i) => (
          <div key={i} style={{ width: 27, borderRight: `1px solid ${colors.line}` }} />
        ))}
        <div style={{ flex: 1 }} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flex: 1, borderLeft: `1px solid ${colors.line}` }}>
      {TICKS.map((_, i) => (
        <div key={i} style={{ flex: 1, borderRight: `1px solid ${colors.line}` }} />
      ))}
    </div>
  )
}

function Row({
  nr,
  name,
  groupId,
  space,
}: {
  nr: number
  name: string
  groupId: number | null
  space: WritingSpace
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 27, borderBottom: `1px solid ${colors.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 212, padding: '0 8px' }}>
        <span style={{ width: 14, fontSize: 8.5, color: colors.faint, fontVariantNumeric: 'tabular-nums' }}>
          {nr}
        </span>
        {groupId != null ? (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 13,
              height: 11,
              borderRadius: 2.5,
              background: sectionColor(groupId).accent,
              color: '#fff',
              fontSize: 7.5,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {groupId}
          </span>
        ) : null}
        <span style={{ fontSize: 11, color: colors.ink }}>{name}</span>
      </div>
      <WriteArea space={space} />
    </div>
  )
}

function GroupHeader({ id, count }: { id: number; count: number }) {
  const palette = sectionColor(id)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        height: 22,
        padding: '0 8px',
        marginTop: 10,
        borderTop: `2px solid ${colors.lineStrong}`,
        background: palette.tint,
      }}
    >
      {id === UNGROUPED_SECTION_ID ? null : (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 14,
            height: 12,
            borderRadius: 2.5,
            background: palette.accent,
            color: '#fff',
            fontSize: 8,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {id}
        </span>
      )}
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: palette.ink }}>
        {sectionTitle(id)}
      </span>
      <span
        style={{ marginLeft: 'auto', fontSize: 8.5, color: palette.ink, opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}
      >
        {count} Schüler
      </span>
    </div>
  )
}

function HeaderMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 7.5, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.faint }}>
        {label}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 700, color: colors.inkSoft, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </div>
  )
}

/** The Wechselplan monogram, matching the PDF's BrandMark. */
function BrandMark() {
  return (
    <svg width={26} height={26} viewBox="0 0 64 64">
      <path d="M13 18 L23 47 L32 30" stroke={colors.brandInk} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M32 30 L41 47 L51 18" stroke={colors.brand} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="51" cy="18" r="4.5" fill={sectionColor(1).accent} />
    </svg>
  )
}

/** A faithful, scaled-down preview of the generated A4 class list. */
export function KlassenlistePreview({
  data,
  selectedGroupIds,
  space,
  createdAt,
}: {
  data: KlassenlisteData
  selectedGroupIds: number[]
  space: WritingSpace
  createdAt: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(MAX_SCALE)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setScale(Math.min(MAX_SCALE, el.clientWidth / SHEET_W))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const shownSections = data.hasPlan
    ? data.sections.filter(s => selectedGroupIds.includes(s.id))
    : []
  const total = data.hasPlan
    ? shownSections.reduce((sum, s) => sum + s.students.length, 0)
    : data.plain.length
  const groupSummary = data.hasPlan
    ? `Gruppen ${shownSections.map(s => (s.id === UNGROUPED_SECTION_ID ? 'ohne' : String(s.id))).join(', ') || '—'}`
    : 'ohne Gruppen'
  const perGroup = data.hasPlan
    ? shownSections
        .filter(s => s.id !== UNGROUPED_SECTION_ID)
        .map(s => `G${s.id} ${s.students.length}`)
        .join(' · ')
    : 'ohne Gruppen'

  return (
    <div ref={wrapRef} className="flex justify-center">
      <div style={{ width: SHEET_W * scale, height: SHEET_H * scale }}>
        <div
          style={{
            width: SHEET_W,
            height: SHEET_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: '#fff',
            color: colors.ink,
            padding: '46px 40px 36px',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            fontFamily: "'IBM Plex Sans', sans-serif",
            boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 24,
              paddingBottom: 8,
              borderBottom: `2px solid ${colors.brand}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BrandMark />
              <div>
                <p style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: 0.6, lineHeight: 1.1 }}>
                  Klassenliste
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: colors.muted, whiteSpace: 'nowrap' }}>
                  {data.className} · Schuljahr {data.schoolYearLabel} · {groupSummary}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              <HeaderMeta label="Erstellt am" value={createdAt} />
              <HeaderMeta label="Klassenvorstand" value={data.classHead ?? '—'} />
              <HeaderMeta label="Klassenleitung" value={data.classLead ?? '—'} />
              <div>
                <p style={{ margin: 0, fontSize: 7.5, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.faint }}>
                  Schüler
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 700, color: colors.inkSoft, fontVariantNumeric: 'tabular-nums' }}>
                  {total} gesamt
                </p>
                <p style={{ margin: '1px 0 0', fontSize: 8, color: colors.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {perGroup}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 14 }}>
            {total === 0 ? (
              <p style={{ marginTop: 24, fontSize: 12, fontStyle: 'italic', color: colors.faint }}>
                Für diese Auswahl sind keine Schüler vorhanden.
              </p>
            ) : data.hasPlan ? (
              shownSections.map(section => (
                <div key={section.id}>
                  <GroupHeader id={section.id} count={section.students.length} />
                  {section.students.map((student, i) => (
                    <Row
                      key={i}
                      nr={i + 1}
                      name={personName(student)}
                      groupId={section.id === UNGROUPED_SECTION_ID ? null : section.id}
                      space={space}
                    />
                  ))}
                </div>
              ))
            ) : (
              data.plain.map((student, i) => (
                <Row key={i} nr={i + 1} name={personName(student)} groupId={null} space={space} />
              ))
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 5,
              borderTop: `1px solid ${colors.line}`,
            }}
          >
            <span style={{ fontSize: 8, color: colors.faint }}>
              Wechselplan · {data.className} · erstellt am {createdAt}
            </span>
            <span style={{ fontSize: 8, color: colors.faint }}>Vorschau</span>
          </div>
        </div>
      </div>
    </div>
  )
}
