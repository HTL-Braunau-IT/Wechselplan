// Emits artifact-ready, theme-able SVG fragments for the three workshop levels.
// Classes only (no inline colors) → the artifact styles them via CSS tokens.
import { writeFileSync } from 'node:fs'

const LEVELS = {
  'eg-e': { title:'Erdgeschoss · Elektrische Werkstätte', cells: [
    { kind:'hof', x:115, y:230, w:215, h:640, lines:['HOF'] },
    { kind:'hof', x:1150, y:230, w:270, h:640, lines:['HOF'] },
    { kind:'gang', x:620, y:230, w:260, h:730, lines:['GANG'] },
    { kind:'gang', x:620, y:960, w:150, h:400, lines:['GANG'] },
    { kind:'gang', x:770, y:1300, w:1180, h:60, lines:[] },
    { kind:'room', name:'E82', x:330, y:230, w:290, h:165, lines:['E82','Labor Haargassner'], door:['R'] },
    { kind:'room', name:'E81', x:330, y:395, w:290, h:165, lines:['E81','Labor Elektronik'], door:['R'] },
    { kind:'room', name:'E80', x:330, y:560, w:290, h:155, lines:['E80','Werkstätte','Industrielle Elektronik'], door:['R'] },
    { kind:'room', name:'E79', x:330, y:715, w:290, h:155, lines:['E79','Labor'], door:['R'] },
    { kind:'room', name:'E83', x:880, y:230, w:270, h:165, lines:['E83','Werkstätte Infotech'], door:['L'] },
    { kind:'room', name:'E84', x:880, y:395, w:270, h:165, lines:['E84','Labor Sigmatec'], door:['L'] },
    { kind:'room', name:'E85', x:880, y:560, w:270, h:155, lines:['E85','Labor Ginzinger I'], door:['L'] },
    { kind:'room', name:'E86', x:880, y:715, w:270, h:155, lines:['E86','Labor Ginzinger II'], door:['L'] },
    { kind:'ctx', name:'E113', x:1420, y:230, w:300, h:125, lines:['E113','Geräteraum'] },
    { kind:'ctx', name:'E112', x:1720, y:230, w:180, h:130, lines:['E112','Außengeräte'] },
    { kind:'ctx', name:'E114', x:1420, y:355, w:240, h:515, lines:['E114','Turnsaal 1'] },
    { kind:'ctx', name:'E110', x:1660, y:355, w:240, h:515, lines:['E110','Turnsaal 2'] },
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
  ]},
  'eg-m': { title:'Erdgeschoss · Mechanische Werkstätte', cells: [
    { kind:'gang', x:950, y:180, w:110, h:1120, lines:['GANG'] },
    { kind:'gang', x:1300, y:720, w:120, h:175, lines:[] },
    { kind:'gang', x:1060, y:895, w:840, h:65, lines:['GANG'] },
    { kind:'gang', x:200, y:1300, w:1700, h:60, lines:['GANG'] },
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
    { kind:'room', name:'E63', x:1060, y:195, w:840, h:210, lines:['E63','Dreherei','Zerspannungstechnik II'], door:['B'] },
    { kind:'room', name:'E65', x:1060, y:405, w:840, h:175, lines:['E65','Dreherei','Zerspannungstechnik I'], door:['L'] },
    { kind:'room', name:'E68',  x:1060, y:580, w:260, h:140, lines:['E68','Hydraulik'], door:['L'] },
    { kind:'room', name:'E68a', x:1320, y:580, w:280, h:140, lines:['E068a','Werkstätte','Antriebstechnik I'] },
    { kind:'room', name:'E68b', x:1600, y:580, w:300, h:140, lines:['E068b','Werkstätte','Antriebstechnik II'], door:['B'] },
    { kind:'room', name:'E69',  x:1060, y:720, w:240, h:175, lines:['E69','CNC-Technik-I'], door:['L'] },
    { kind:'room', name:'E78a', x:1420, y:720, w:480, h:175, lines:['E78a','E-Installation'], door:['B'] },
    { kind:'room', name:'E72',  x:1060, y:960, w:840, h:340, lines:['E72','Maschinenlabor'], door:['T'] },
  ]},
  'og1': { title:'1. Stock · Elektrische Werkstätte', cells: [
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
  ]},
}

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
function labelBlock(c){
  const cx=c.x+c.w/2, cy=c.y+c.h/2, n=c.lines.length, lh=24
  if(c.rot){
    return c.lines.map((ln,i)=>`<text class="${i===0?'r-name':'r-label'}" x="${cx}" y="${cy}" text-anchor="middle" transform="rotate(-90 ${cx} ${cy}) translate(0 ${(i-(n-1)/2)*lh})">${esc(ln)}</text>`).join('')
  }
  const startY=cy-((n-1)*lh)/2+5
  return c.lines.map((ln,i)=>{
    const cls=i===0&&(c.kind==='room'||c.kind==='ctx')?'r-name':(c.kind==='hof'?'hof-t':c.kind==='gang'?'gang-t':'r-label')
    return `<text class="${cls}" x="${cx}" y="${startY+i*lh}" text-anchor="middle">${esc(ln)}</text>`
  }).join('')
}
function door(c){
  if(!c.door) return ''
  return c.door.map(side=>{
    let x,y,rot
    if(side==='R'){x=c.x+c.w;y=c.y+c.h/2;rot=0} else if(side==='L'){x=c.x;y=c.y+c.h/2;rot=180}
    else if(side==='T'){x=c.x+c.w/2;y=c.y;rot=-90} else {x=c.x+c.w/2;y=c.y+c.h;rot=90}
    return `<g class="door" transform="rotate(${rot} ${x} ${y})"><rect class="door-gap" x="${x-13}" y="${y-13}" width="26" height="26"/><path class="door-line" d="M ${x-8} ${y-9} L ${x+7} ${y} L ${x-8} ${y+9}"/></g>`
  }).join('')
}
function body(cells){
  let o=''
  for(const c of cells.filter(c=>c.kind==='gang')) o+=`<rect class="gang" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>`
  for(const c of cells.filter(c=>c.kind==='hof')) o+=`<rect class="hof" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>`
  for(const c of cells.filter(c=>(c.kind==='gang'||c.kind==='hof')&&c.lines.length)) o+=labelBlock(c)
  for(const c of cells.filter(c=>c.kind==='room'||c.kind==='ctx')) o+=`<g class="${c.kind==='room'?'room room--db':'room room--ctx'}" data-room="${esc(c.name)}"><rect class="room-box" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>${labelBlock(c)}</g>`
  for(const c of cells) o+=door(c)
  return o
}

let html=''
for(const [key,lv] of Object.entries(LEVELS)){
  html += `<svg class="rp-svg" data-level="${key}" viewBox="0 0 2000 1400" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(lv.title)}"${key!=='eg-e'?' hidden':''}>${body(lv.cells)}</svg>\n`
}
writeFileSync(new URL('./plans-partial.html', import.meta.url), html)
console.log('wrote plans-partial.html ·', html.length, 'bytes')
