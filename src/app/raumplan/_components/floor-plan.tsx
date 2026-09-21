'use client'

import { Fragment } from 'react'
import { LEVELS, VIEWBOX, type LevelKey, type PlanCell } from '@/lib/raumplan/levels'
import type { RoomCell, RoomState } from '@/lib/raumplan/types'
import styles from './floor-plan.module.css'

const LH = 24 // label line height, matches the generator

interface FloorPlanProps {
  level: LevelKey
  /** Occupancy for the current (weekday, period), keyed by Room.name. */
  occupancy: Map<string, RoomCell>
  selectedRoom: string | null
  onSelectRoom: (roomName: string) => void
}

/**
 * Renders one workshop level as a theme-able SVG. Geometry comes from the traced
 * `LEVELS` data; occupancy is mapped onto DB rooms by `Room.name`. DB rooms are
 * clickable; context rooms are muted orientation only.
 */
export function FloorPlan({ level, occupancy, selectedRoom, onSelectRoom }: FloorPlanProps) {
  const def = LEVELS.find(l => l.key === level)
  if (!def) return null

  const gangs = def.cells.filter(c => c.kind === 'gang')
  const hofs = def.cells.filter(c => c.kind === 'hof')
  const rooms = def.cells.filter(c => c.kind === 'room' || c.kind === 'ctx')

  return (
    <svg
      className={styles.plan}
      data-level={level}
      viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={def.title}
    >
      <defs>
        <pattern
          id="rp-hatch"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line data-cell="hatch-line" x1="0" y1="0" x2="0" y2="12" />
        </pattern>
      </defs>

      {gangs.map((c, i) => (
        <rect key={`g${i}`} data-cell="gang" x={c.x} y={c.y} width={c.w} height={c.h} />
      ))}
      {hofs.map((c, i) => (
        <rect key={`h${i}`} data-cell="hof" x={c.x} y={c.y} width={c.w} height={c.h} />
      ))}
      {[...gangs, ...hofs]
        .filter(c => c.lines.length)
        .map((c, i) => (
          <Labels key={`gl${i}`} cell={c} kind={c.kind === 'hof' ? 'hof-t' : 'gang-t'} />
        ))}

      {rooms.map((c, i) => {
        const isDb = c.kind === 'room'
        const cell = isDb && c.name ? occupancy.get(c.name) : undefined
        const state: RoomState | undefined = cell?.state
        const selected = isDb && c.name != null && c.name === selectedRoom
        return (
          <g
            key={`r${i}`}
            data-cell="room"
            data-db={isDb}
            data-room={c.name}
            data-state={state}
            data-selected={selected}
            onClick={isDb && c.name ? () => onSelectRoom(c.name!) : undefined}
            tabIndex={isDb ? 0 : undefined}
            onKeyDown={
              isDb && c.name
                ? e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectRoom(c.name!)
                    }
                  }
                : undefined
            }
            role={isDb ? 'button' : undefined}
            aria-label={isDb ? c.name : undefined}
          >
            <rect data-cell="room-box" x={c.x} y={c.y} width={c.w} height={c.h} />
            <Labels cell={c} kind="room" />
          </g>
        )
      })}

      {rooms.concat(gangs, hofs).map((c, i) => (
        <Doors key={`d${i}`} cell={c} />
      ))}
    </svg>
  )
}

/** Renders a cell's centred (or rotated) text lines. */
function Labels({ cell, kind }: { cell: PlanCell; kind: 'room' | 'hof-t' | 'gang-t' }) {
  const cx = cell.x + cell.w / 2
  const cy = cell.y + cell.h / 2
  const n = cell.lines.length

  if (cell.rot) {
    return (
      <Fragment>
        {cell.lines.map((line, i) => (
          <text
            key={i}
            data-cell={i === 0 ? 'r-name' : 'r-label'}
            x={cx}
            y={cy}
            textAnchor="middle"
            transform={`rotate(-90 ${cx} ${cy}) translate(0 ${(i - (n - 1) / 2) * LH})`}
          >
            {line}
          </text>
        ))}
      </Fragment>
    )
  }

  const startY = cy - ((n - 1) * LH) / 2 + 5
  return (
    <Fragment>
      {cell.lines.map((line, i) => {
        const dataCell = kind === 'room' ? (i === 0 ? 'r-name' : 'r-label') : kind
        return (
          <text key={i} data-cell={dataCell} x={cx} y={startY + i * LH} textAnchor="middle">
            {line}
          </text>
        )
      })}
    </Fragment>
  )
}

/** Renders a cell's door leaves. */
function Doors({ cell }: { cell: PlanCell }) {
  if (!cell.door) return null
  return (
    <Fragment>
      {cell.door.map((side, i) => {
        let x: number
        let y: number
        let rot: number
        if (side === 'R') {
          x = cell.x + cell.w
          y = cell.y + cell.h / 2
          rot = 0
        } else if (side === 'L') {
          x = cell.x
          y = cell.y + cell.h / 2
          rot = 180
        } else if (side === 'T') {
          x = cell.x + cell.w / 2
          y = cell.y
          rot = -90
        } else {
          x = cell.x + cell.w / 2
          y = cell.y + cell.h
          rot = 90
        }
        return (
          <g key={i} data-cell="door" transform={`rotate(${rot} ${x} ${y})`}>
            <rect data-cell="door-gap" x={x - 13} y={y - 13} width={26} height={26} />
            <path
              data-cell="door-line"
              d={`M ${x - 8} ${y - 9} L ${x + 7} ${y} L ${x - 8} ${y + 9}`}
            />
          </g>
        )
      })}
    </Fragment>
  )
}
