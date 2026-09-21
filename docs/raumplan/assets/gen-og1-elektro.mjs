// 1:1 faithful trace of "1. Stock - Elektrische Werkstätte" (clean source, page 9).
import { writeFileSync } from 'node:fs'
const VB_W = 2000, VB_H = 1400
const WALL = '#242830'

const cells = [
  { kind:'hof', x:370, y:300, w:150, h:950, lines:['HOF'] },
  { kind:'hof', x:1450, y:300, w:150, h:950, lines:['HOF'] },
  { kind:'gang', x:840, y:300, w:290, h:950, lines:['GANG'] },

  { kind:'room', name:'145', x:520, y:300,  w:320, h:225, lines:['145','Werkstätte','Kommunikationssysteme'], door:['R'] },
  { kind:'room', name:'144', x:520, y:525,  w:320, h:250, lines:['144','Werkstätte','Löttechnik'], door:['R'] },
  { kind:'room', name:'143', x:520, y:775,  w:320, h:225, lines:['143','Werkstätte','Steuerungstechnik'], door:['R'] },
  { kind:'room', name:'142', x:520, y:1000, w:320, h:250, lines:['142','Werkstätte','Grundlagen ET','Steuerungstechnik'], door:['R'] },

  { kind:'room', name:'146', x:1130, y:300,  w:320, h:225, lines:['146','Werkstätte','CAD Anwendungen'], door:['L'] },
  { kind:'room', name:'147', x:1130, y:525,  w:320, h:250, lines:['147','Werkstätte','Computer- und','Netzwerktechnik'], door:['L'] },
  { kind:'room', name:'148', x:1130, y:775,  w:320, h:225, lines:['148','Elektronik und','E-Mobilität'], door:['L'] },
  { kind:'room', name:'149', x:1130, y:1000, w:320, h:250, lines:['149','Werkstätte','SMD-Technik'], door:['L'] },
]

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
function labelBlock(c) {
  const cx=c.x+c.w/2, cy=c.y+c.h/2, n=c.lines.length, lh=24
  const startY = cy - ((n-1)*lh)/2 + 5
  return c.lines.map((ln,i)=>{
    const cls = i===0&&(c.kind==='room') ? 'r-name' : (c.kind==='hof'?'hof-t':c.kind==='gang'?'gang-t':'r-label')
    return `<text class="${cls}" x="${cx}" y="${startY+i*lh}" text-anchor="middle">${esc(ln)}</text>`
  }).join('')
}
function door(c){
  if(!c.door) return ''
  return c.door.map(side=>{
    let x,y,rot
    if(side==='R'){x=c.x+c.w;y=c.y+c.h/2;rot=0} else if(side==='L'){x=c.x;y=c.y+c.h/2;rot=180}
    else if(side==='T'){x=c.x+c.w/2;y=c.y;rot=-90} else {x=c.x+c.w/2;y=c.y+c.h;rot=90}
    return `<g class="door" transform="rotate(${rot} ${x} ${y})"><rect x="${x-13}" y="${y-13}" width="26" height="26" fill="#fff"/>`
      +`<path d="M ${x-8} ${y-9} L ${x+7} ${y} L ${x-8} ${y+9}" fill="none" stroke="${WALL}" stroke-width="2.4"/></g>`
  }).join('')
}
let out=''
for(const c of cells.filter(c=>c.kind==='gang')) out+=`  <rect class="gang" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>\n`
for(const c of cells.filter(c=>c.kind==='hof')) out+=`  <rect class="hof" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>\n`
for(const c of cells.filter(c=>c.kind==='gang'||c.kind==='hof')) out+=`  ${labelBlock(c)}\n`
for(const c of cells.filter(c=>c.kind==='room')){
  out+=`  <g class="room room--db" data-room="${esc(c.name)}">\n    <rect class="room-box" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>\n    ${labelBlock(c)}\n  </g>\n`
}
for(const c of cells) out+=door(c)

const svg=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}" font-family="'IBM Plex Sans', system-ui, sans-serif">
  <title>1. Stock – Elektrische Werkstätte (1:1 Trace)</title>
  <defs>
    <pattern id="hof" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#f4f5f7"/><line x1="0" y1="0" x2="0" y2="10" stroke="#dde1e7" stroke-width="1.4"/>
    </pattern>
  </defs>
  <style>
    .titlebar{fill:#cfd2d6}.title-t{font-size:44px;font-weight:600;fill:#20242b}
    .gang{fill:#c9ccd1}.gang-t{font-size:22px;letter-spacing:.06em;fill:#5f656d;font-weight:500}
    .hof{fill:url(#hof);stroke:#c9ccd1;stroke-width:1.5}.hof-t{font-size:24px;letter-spacing:.12em;fill:#9aa0a8;font-weight:600}
    .room-box{fill:#eef3ff;stroke:#2f4bc0;stroke-width:3.2}
    .r-name{font-size:22px;font-weight:600;fill:#233b9c}.r-label{font-size:18px;fill:#4c535d}
  </style>
  <rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="#ffffff"/>
  <rect class="titlebar" x="520" y="90" width="930" height="86" rx="2"/>
  <text class="title-t" x="985" y="150" text-anchor="middle">1. Stock · Elektrische Werkstätte</text>
${out}
</svg>
`
writeFileSync(new URL('./og1-elektrische-werkstaette.svg', import.meta.url), svg)
console.log('wrote og1-elektrische-werkstaette.svg')
