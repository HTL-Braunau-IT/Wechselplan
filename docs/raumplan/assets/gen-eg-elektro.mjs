// 1:1 faithful trace of "Erdgeschoss - Elektrische Werkstätte" (clean source, page 8).
// Rooms, hallways (GANG), courtyards (HOF), doors. data-room = DB Room.name.
import { writeFileSync } from 'node:fs'

const VB_W = 2000, VB_H = 1400
const WALL = '#242830'

// kind: room (teaching, in DB) | ctx (context, not in DB) | hof | gang
// lines = label rows. door = ['R'|'L'|'T'|'B', ...] walls with a door.
const cells = [
  // courtyards
  { kind:'hof', x:115, y:230, w:215, h:640, lines:['HOF'] },
  { kind:'hof', x:1150, y:230, w:270, h:640, lines:['HOF'] },
  // hallways
  { kind:'gang', x:620, y:230, w:260, h:730, lines:['GANG'] },
  { kind:'gang', x:620, y:960, w:150, h:400, lines:['GANG'] },
  { kind:'gang', x:770, y:1300, w:1180, h:60, lines:[] },

  // --- left teaching column ---
  { kind:'room', name:'E82', x:330, y:230, w:290, h:165, lines:['E82','Labor Haargassner'], door:['R'] },
  { kind:'room', name:'E81', x:330, y:395, w:290, h:165, lines:['E81','Labor Elektronik'], door:['R'] },
  { kind:'room', name:'E80', x:330, y:560, w:290, h:155, lines:['E80','Werkstätte','Industrielle Elektronik'], door:['R'] },
  { kind:'room', name:'E79', x:330, y:715, w:290, h:155, lines:['E79','Labor'], door:['R'] },
  // --- middle teaching column ---
  { kind:'room', name:'E83', x:880, y:230, w:270, h:165, lines:['E83','Werkstätte Infotech'], door:['L'] },
  { kind:'room', name:'E84', x:880, y:395, w:270, h:165, lines:['E84','Labor Sigmatec'], door:['L'] },
  { kind:'room', name:'E85', x:880, y:560, w:270, h:155, lines:['E85','Labor Ginzinger I'], door:['L'] },
  { kind:'room', name:'E86', x:880, y:715, w:270, h:155, lines:['E86','Labor Ginzinger II'], door:['L'] },

  // --- right block (context: gym / storage) ---
  { kind:'ctx', name:'E113', x:1420, y:230, w:300, h:125, lines:['E113','Geräteraum'] },
  { kind:'ctx', name:'E112', x:1720, y:230, w:180, h:130, lines:['E112','Außengeräte'] },
  { kind:'ctx', name:'E114', x:1420, y:355, w:240, h:515, lines:['E114','Turnsaal 1'] },
  { kind:'ctx', name:'E110', x:1660, y:355, w:240, h:515, lines:['E110','Turnsaal 2'] },

  // --- lower zone ---
  { kind:'room', name:'E77', x:115, y:905, w:430, h:235, lines:['E77','EDV-1 Promotech'], door:['R'] },
  { kind:'ctx',  name:'E75', x:545, y:985, w:100, h:155, lines:['E75','Ton-','studio'] },
  { kind:'room', name:'E74', x:115, y:1140, w:215, h:160, lines:['E74','Videostudio'], door:['B'] },
  { kind:'room', name:'E74', x:330, y:1140, w:315, h:160, lines:['E74','Videostudio'], door:['B'] },
  { kind:'ctx',  name:'E87', x:770, y:960, w:220, h:340, lines:['E87','Aufenthaltsraum','Lehrer'], door:['T'] },
  { kind:'room', name:'E89', x:990, y:960, w:160, h:340, lines:['E89','Labor','3D Maker'], door:['T'] },
  { kind:'ctx',  name:'E90/91', x:1150, y:960, w:250, h:340, lines:['E90 + 91','Labor','Ingenieurprojekte'] },
  { kind:'ctx',  name:'WC', x:1400, y:905, w:500, h:225, lines:['WC + Waschraum'] },
  { kind:'ctx',  name:'WC', x:1400, y:1130, w:220, h:170, lines:['WC + Waschraum'] },
  { kind:'ctx',  name:'E101', x:1620, y:1130, w:280, h:170, lines:['E101','Schularzt'] },
]

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

function labelBlock(c) {
  const cx = c.x + c.w/2
  const n = c.lines.length
  const lh = 26
  let startY = c.y + c.h/2 - ((n-1)*lh)/2 + 6
  // room-number first line bold, rest lighter
  return c.lines.map((ln,i) => {
    const cls = (c.kind==='room'||c.kind==='ctx') && i===0 ? 'r-name' : (c.kind==='hof'?'hof-t':c.kind==='gang'?'gang-t':'r-label')
    return `<text class="${cls}" x="${cx}" y="${startY + i*lh}" text-anchor="middle">${esc(ln)}</text>`
  }).join('')
}

function door(c) {
  if (!c.door) return ''
  return c.door.map(side => {
    let x, y
    if (side==='R') { x=c.x+c.w; y=c.y+c.h/2 }
    else if (side==='L') { x=c.x; y=c.y+c.h/2 }
    else if (side==='T') { x=c.x+c.w/2; y=c.y }
    else { x=c.x+c.w/2; y=c.y+c.h } // B
    // small door marker: white gap + chevron diamond
    return `<g class="door"><rect x="${x-13}" y="${y-13}" width="26" height="26" fill="#fff" stroke="none"/>`
      + `<path d="M ${x-8} ${y-9} L ${x+7} ${y} L ${x-8} ${y+9}" fill="none" stroke="${WALL}" stroke-width="2.4"/></g>`
  }).join('')
}

let out = ''
// draw gang + hof first (background), then rooms on top
for (const c of cells.filter(c=>c.kind==='gang')) out += `  <rect class="gang" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>\n`
for (const c of cells.filter(c=>c.kind==='hof')) out += `  <rect class="hof" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>\n`
for (const c of cells.filter(c=>c.kind==='gang'||c.kind==='hof')) out += `  ${labelBlock(c)}\n`

for (const c of cells.filter(c=>c.kind==='room'||c.kind==='ctx')) {
  const klass = c.kind==='room' ? 'room room--db' : 'room room--ctx'
  out += `  <g class="${klass}" data-room="${esc(c.name)}">\n`
  out += `    <rect class="room-box" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>\n`
  out += `    ${labelBlock(c)}\n`
  out += `  </g>\n`
}
for (const c of cells) out += door(c)

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}" font-family="'IBM Plex Sans', system-ui, sans-serif">
  <title>Erdgeschoss – Elektrische Werkstätte (1:1 Trace)</title>
  <defs>
    <pattern id="hof" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#f4f5f7"/>
      <line x1="0" y1="0" x2="0" y2="10" stroke="#dde1e7" stroke-width="1.4"/>
    </pattern>
  </defs>
  <style>
    .titlebar { fill:#cfd2d6; }
    .title-t { font-size:44px; font-weight:600; fill:#20242b; }
    .gang { fill:#c9ccd1; }
    .gang-t { font-size:22px; letter-spacing:.06em; fill:#5f656d; font-weight:500; }
    .hof { fill:url(#hof); stroke:#c9ccd1; stroke-width:1.5; }
    .hof-t { font-size:24px; letter-spacing:.12em; fill:#9aa0a8; font-weight:600; }
    .room-box { fill:#ffffff; stroke:${WALL}; stroke-width:3; }
    .room--db .room-box { fill:#eef3ff; stroke:#2f4bc0; stroke-width:3.4; }
    .room--ctx .room-box { fill:#fafafa; stroke:#9aa0a8; stroke-width:2; }
    .r-name { font-size:22px; font-weight:600; fill:#1a1e25; }
    .room--db .r-name { fill:#233b9c; }
    .room--ctx .r-name { fill:#71777f; font-weight:500; }
    .r-label { font-size:19px; fill:#4c535d; }
    .room--ctx .r-label { fill:#8b919a; }
  </style>
  <rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="#ffffff"/>
  <rect class="titlebar" x="115" y="60" width="1785" height="86" rx="2"/>
  <text class="title-t" x="1000" y="120" text-anchor="middle">Erdgeschoss · Elektrische Werkstätte</text>

${out}
</svg>
`
writeFileSync(new URL('./eg-elektrische-werkstaette.svg', import.meta.url), svg)
const db = cells.filter(c=>c.kind==='room')
console.log('wrote eg-elektrische-werkstaette.svg · DB-Räume:', [...new Set(db.map(c=>c.name))].join(', '))
