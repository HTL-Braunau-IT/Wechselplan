// 1:1 faithful trace of "Erdgeschoss - Mechanische Werkstätte" (clean source, page 7).
import { writeFileSync } from 'node:fs'
const VB_W = 2000, VB_H = 1400
const WALL = '#242830'

const cells = [
  // central + edge hallways
  { kind:'gang', x:950, y:180, w:110, h:1120, lines:['GANG'] },
  { kind:'gang', x:1300, y:720, w:120, h:175, lines:[] },        // small gang between E69/E78a
  { kind:'gang', x:1060, y:895, w:840, h:65, lines:['GANG'] },   // right horizontal
  { kind:'gang', x:200, y:1300, w:1700, h:60, lines:['GANG'] },  // bottom

  // ===== LEFT BLOCK =====
  { kind:'ctx',  name:'E59', x:200, y:195, w:275, h:90,  lines:['E59','Zuschneiden'] },
  { kind:'ctx',  name:'E58', x:200, y:285, w:275, h:125, lines:['E58','Spänebunker'], door:['B'] },
  { kind:'room', name:'E61', x:475, y:195, w:245, h:215, lines:['E61','Schweißtechnik'], door:['R'] },
  { kind:'room', name:'E62', x:720, y:195, w:230, h:215, lines:['E62','Schweißtechnik'], door:['R'] },

  { kind:'room', name:'E57', x:200, y:410, w:275, h:165, lines:['E57','Blechbearbeitung'], door:['R'] },
  { kind:'room', name:'E64', x:475, y:410, w:475, h:165, lines:['E64','Mechanische Grundausbildung'], door:['R'] },

  { kind:'room', name:'E56', x:200, y:575, w:160, h:155, lines:['E56','CNC Drehen'], door:['B'] },
  { kind:'ctx',  name:'E67', x:360, y:575, w:215, h:120, lines:['E67','Unterweisung'] },
  { kind:'room', name:'E66', x:575, y:575, w:375, h:155, lines:['E66','Ingenieurprojekte'], door:['R'] },

  { kind:'ctx',  name:'E55', x:200, y:730, w:750, h:165, lines:['E55','Zentrallager'], door:['R'] },

  // bottom-left small rooms
  { kind:'ctx',  name:'E54', x:200, y:895,  w:255, h:125, lines:['E54','Hochspannungsraum'] },
  { kind:'ctx',  name:'E49', x:200, y:1020, w:255, h:210, lines:['E49','Niederspannungsraum'] },
  { kind:'ctx',  name:'E50', x:200, y:1230, w:255, h:70,  lines:['E50','Müllraum'], door:['B'] },
  { kind:'room', name:'E46', x:455, y:895,  w:120, h:265, lines:['E46','3D Drucker'], rot:true, door:['T'] },
  { kind:'room', name:'E48', x:455, y:1160, w:120, h:140, lines:['E48','Kunststofftechnik'], rot:true, door:['B'] },
  { kind:'room', name:'E45', x:575, y:895,  w:145, h:140, lines:['E45','Instrumenten-','raum'], door:['R'] },
  { kind:'room', name:'E47', x:575, y:1035, w:145, h:265, lines:['E47','Leiterplatten-','fertigung'], door:['B'] },
  { kind:'ctx',  name:'E44', x:720, y:895,  w:230, h:115, lines:['E44','Dunkelkammer'], door:['R'] },
  { kind:'room', name:'E43', x:720, y:1010, w:230, h:140, lines:['E43','Lehrer'], door:['R'] },
  { kind:'room', name:'E42', x:720, y:1150, w:230, h:150, lines:['E42','Lehrer'], door:['R'] },

  // ===== RIGHT BLOCK =====
  { kind:'room', name:'E63', x:1060, y:195, w:840, h:210, lines:['E63','Dreherei','Zerspannungstechnik II'], door:['B'] },
  { kind:'room', name:'E65', x:1060, y:405, w:840, h:175, lines:['E65','Dreherei','Zerspannungstechnik I'], door:['L'] },
  { kind:'room', name:'E68',  x:1060, y:580, w:260, h:140, lines:['E68','Hydraulik'], door:['L'] },
  { kind:'room', name:'E68a', x:1320, y:580, w:280, h:140, lines:['E068a','Werkstätte','Antriebstechnik I'] },
  { kind:'room', name:'E68b', x:1600, y:580, w:300, h:140, lines:['E068b','Werkstätte','Antriebstechnik II'], door:['B'] },
  { kind:'room', name:'E69',  x:1060, y:720, w:240, h:175, lines:['E69','CNC-Technik-I'], door:['L'] },
  { kind:'room', name:'E78a', x:1420, y:720, w:480, h:175, lines:['E78a','E-Installation'], door:['B'] },
  { kind:'room', name:'E72',  x:1060, y:960, w:840, h:340, lines:['E72','Maschinenlabor'], door:['T'] },
]

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
function labelBlock(c) {
  const cx = c.x + c.w/2, cy = c.y + c.h/2
  const n = c.lines.length, lh = 24
  if (c.rot) {
    // vertical text
    return c.lines.map((ln,i) =>
      `<text class="${i===0?'r-name':'r-label'}" x="${cx}" y="${cy}" text-anchor="middle" transform="rotate(-90 ${cx} ${cy}) translate(0 ${(i-(n-1)/2)*lh})">${esc(ln)}</text>`
    ).join('')
  }
  const startY = cy - ((n-1)*lh)/2 + 5
  return c.lines.map((ln,i) => {
    const cls = i===0 && (c.kind==='room'||c.kind==='ctx') ? 'r-name' : (c.kind==='gang'?'gang-t':'r-label')
    return `<text class="${cls}" x="${cx}" y="${startY+i*lh}" text-anchor="middle">${esc(ln)}</text>`
  }).join('')
}
function door(c) {
  if (!c.door) return ''
  return c.door.map(side => {
    let x,y,rot
    if (side==='R'){x=c.x+c.w;y=c.y+c.h/2;rot=0}
    else if (side==='L'){x=c.x;y=c.y+c.h/2;rot=180}
    else if (side==='T'){x=c.x+c.w/2;y=c.y;rot=-90}
    else {x=c.x+c.w/2;y=c.y+c.h;rot=90}
    return `<g class="door" transform="rotate(${rot} ${x} ${y})"><rect x="${x-13}" y="${y-13}" width="26" height="26" fill="#fff"/>`
      + `<path d="M ${x-8} ${y-9} L ${x+7} ${y} L ${x-8} ${y+9}" fill="none" stroke="${WALL}" stroke-width="2.4"/></g>`
  }).join('')
}

let out = ''
for (const c of cells.filter(c=>c.kind==='gang')) out += `  <rect class="gang" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>\n`
for (const c of cells.filter(c=>c.kind==='gang' && c.lines.length)) out += `  ${labelBlock(c)}\n`
for (const c of cells.filter(c=>c.kind==='room'||c.kind==='ctx')) {
  out += `  <g class="${c.kind==='room'?'room room--db':'room room--ctx'}" data-room="${esc(c.name)}">\n`
  out += `    <rect class="room-box" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>\n    ${labelBlock(c)}\n  </g>\n`
}
for (const c of cells) out += door(c)

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}" font-family="'IBM Plex Sans', system-ui, sans-serif">
  <title>Erdgeschoss – Mechanische Werkstätte (1:1 Trace)</title>
  <style>
    .titlebar { fill:#cfd2d6; }
    .title-t { font-size:44px; font-weight:600; fill:#20242b; }
    .gang { fill:#c9ccd1; }
    .gang-t { font-size:22px; letter-spacing:.06em; fill:#5f656d; font-weight:500; }
    .room-box { fill:#ffffff; stroke:${WALL}; stroke-width:3; }
    .room--db .room-box { fill:#eef3ff; stroke:#2f4bc0; stroke-width:3.2; }
    .room--ctx .room-box { fill:#fafafa; stroke:#9aa0a8; stroke-width:2; }
    .r-name { font-size:21px; font-weight:600; fill:#1a1e25; }
    .room--db .r-name { fill:#233b9c; }
    .room--ctx .r-name { fill:#71777f; font-weight:500; }
    .r-label { font-size:17px; fill:#4c535d; }
    .room--ctx .r-label { fill:#8b919a; }
  </style>
  <rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="#ffffff"/>
  <rect class="titlebar" x="200" y="60" width="1700" height="86" rx="2"/>
  <text class="title-t" x="1050" y="120" text-anchor="middle">Erdgeschoss · Mechanische Werkstätte</text>
${out}
</svg>
`
writeFileSync(new URL('./eg-mechanische-werkstaette.svg', import.meta.url), svg)
console.log('wrote eg-mechanische-werkstaette.svg · DB:', [...new Set(cells.filter(c=>c.kind==='room').map(c=>c.name))].join(', '))
