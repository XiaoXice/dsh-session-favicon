/**
 * Generates the README illustrations (`states.svg`, `themes.svg`, `flow.svg`).
 *
 * The badge geometry and colours below are MIRRORED FROM `../client.js`, so the
 * pictures cannot drift from what the plugin actually paints. Re-run after
 * changing any of `CX / CY / R / PLATE_SCALE / DOT_SCALE / ARC_SCALE / ARC_W /
 * DOT_COLORS / SPIN / PLATES`:
 *
 *   node docs/generate-figures.mjs
 *
 * The stand-in for the page's own artwork is deliberately generic: the shipped
 * favicons are DeepSeek's brand assets and are not redistributed here.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('.', import.meta.url))

// ---- constants mirrored from client.js --------------------------------
const CX = 0.70, CY = 0.70, R = 0.24
const PLATE_SCALE = 1.20
const DOT_SCALE = 0.86
const ARC_SCALE = 0.82
const ARC_W = 0.075
const DOT_COLORS = { done: '#22c55e', asking: '#f59e0b', error: '#ef4444' }
const SPIN = '#3b82f6'
const PLATES = {
  light: { fill: 'rgba(255,255,255,0.94)', ring: 'rgba(15,23,42,0.22)' },
  dark: { fill: 'rgba(15,23,42,0.88)', ring: 'rgba(255,255,255,0.28)' },
}
const ICON = 64
const FONT = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif"
const INK = '#0f172a', MUTED = '#64748b', LINE = '#cbd5e1'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function markerDefs(id, color) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 1 L 9 5 L 0 9 z" fill="${color}"/>
  </marker>`
}

/**
 * One favicon drawn at `scale`, offset by (ox, oy) inside its panel.
 *
 * The stand-in for the page's own artwork is a FILLED ROUNDED SQUARE, because a
 * favicon is a square canvas — drawing a disc here made the badge look as if it
 * hung off the icon's edge. `state === 'none'` draws the bare stand-in,
 * `'idle'` adds the dashed "the badge would go here" ring.
 */
function iconGroup({ ox, oy, scale, state, theme }) {
  const t = (v) => v * scale
  const size = ICON * scale
  const bg = theme === 'dark' ? '#f8fafc' : '#0f172a'
  const contrast = theme === 'dark' ? '#0f172a' : '#f8fafc'
  const parts = []

  parts.push(`<rect x="${ox}" y="${oy}" width="${size}" height="${size}" rx="${t(13)}" fill="${bg}"/>`)
  // generic "picture" placeholder: outlined frame + sun, reading as "your artwork"
  parts.push(`<g opacity="0.30">
    <rect x="${ox + t(16)}" y="${oy + t(16)}" width="${t(32)}" height="${t(32)}" rx="${t(5)}" fill="none" stroke="${contrast}" stroke-width="${t(2.4)}"/>
    <circle cx="${ox + t(24)}" cy="${oy + t(24)}" r="${t(3.2)}" fill="${contrast}"/>
    <path d="M ${ox + t(17)} ${oy + t(45)} L ${ox + t(28)} ${oy + t(34)} L ${ox + t(36)} ${oy + t(42)} L ${ox + t(43)} ${oy + t(35)} L ${ox + t(47)} ${oy + t(39)} L ${ox + t(47)} ${oy + t(47)} L ${ox + t(17)} ${oy + t(47)} Z" fill="${contrast}"/>
  </g>`)

  if (state === 'none') return `<g>${parts.join('\n')}</g>`

  const cx = ox + t(CX * ICON)
  const cy = oy + t(CY * ICON)
  const plateR = t(R * ICON * PLATE_SCALE)
  const plate = theme === 'dark' ? PLATES.dark : PLATES.light

  if (state === 'idle') {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${plateR}" fill="none" stroke="#94a3b8" stroke-opacity="0.85" stroke-width="${Math.max(1.2, t(1.1))}" stroke-dasharray="${t(3)} ${t(3)}"/>`)
    return `<g>${parts.join('\n')}</g>`
  }

  parts.push(`<circle cx="${cx}" cy="${cy}" r="${plateR}" fill="${plate.fill}" stroke="${plate.ring}" stroke-width="${Math.max(1.2, t(1.1))}"/>`)
  if (state === 'running') {
    const arcR = t(R * ICON * ARC_SCALE)
    const w = t(ARC_W * ICON)
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${arcR}" fill="none" stroke="${plate.ring}" stroke-width="${w}"/>`)
    const start = -Math.PI / 2
    const end = start + Math.PI * 1.35
    const p = (a, r) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`
    parts.push(`<path d="M ${p(start, arcR)} A ${arcR} ${arcR} 0 1 1 ${p(end, arcR)}" fill="none" stroke="${SPIN}" stroke-width="${w}" stroke-linecap="round"/>`)
  } else {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${t(R * ICON * DOT_SCALE)}" fill="${DOT_COLORS[state]}"/>`)
  }
  return `<g>${parts.join('\n')}</g>`
}

/** A framed 104px cell; children are authored in CELL-LOCAL coordinates. */
function cell({ x, y, w, theme, children }) {
  const bg = theme === 'dark' ? '#0f172a' : '#ffffff'
  const border = theme === 'dark' ? '#334155' : LINE
  return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${w}" rx="14" fill="${bg}" stroke="${border}" stroke-width="1"/>
  <g transform="translate(${x},${y})">
  ${children}
  </g>
</g>`
}

// ---- Fig 1: the five states ------------------------------------------
function figStates() {
  const states = [
    { key: 'idle', title: '待机 / 新会话', note: '原图标不动' },
    { key: 'running', title: '运行中', note: '右下角转圈' },
    { key: 'asking', title: '等你输入', note: '橙黄点' },
    { key: 'done', title: '执行完毕', note: '绿点' },
    { key: 'error', title: '出错', note: '红点' },
  ]
  const PAD = 30, GAP = 18, W = 104, TOP = 22, LABEL = 54
  const width = PAD * 2 + states.length * W + (states.length - 1) * GAP
  const height = TOP + W + LABEL
  const scale = 1.375
  const body = states.map((s, i) => {
    const x = PAD + i * (W + GAP)
    const cx = x + W / 2
    return `${cell({ x, y: TOP, w: W, theme: 'light', children: iconGroup({ ox: 8, oy: 8, scale, state: s.key, theme: 'light' }) })}
    <text x="${cx}" y="${TOP + W + 24}" text-anchor="middle" font-size="13" font-weight="600" fill="${INK}">${esc(s.title)}</text>
    <text x="${cx}" y="${TOP + W + 42}" text-anchor="middle" font-size="11" fill="${MUTED}">${esc(s.note)}</text>`
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">
${body}
</svg>
`
}

// ---- Fig 2: light vs dark --------------------------------------------
function figThemes() {
  const PAD = 26, W = 104, ARROW = 46, TOP = 22
  const ROWLABEL = 24, CAPTION = 20, ROWGAP = 26
  const scale = 1.375
  const rows = [
    { theme: 'light', title: '亮色：页面用黑鲸鱼（favicon.svg）' },
    { theme: 'dark', title: '暗色：页面用白鲸鱼（favicon-dark.svg）' },
  ]
  const blockH = ROWLABEL + W + CAPTION
  const height = TOP + blockH * rows.length + ROWGAP * (rows.length - 1) + 10
  const width = PAD * 2 + W + ARROW + W
  const out = []
  rows.forEach((row, i) => {
    const top = TOP + i * (blockH + ROWGAP)
    const y = top + ROWLABEL
    const leftX = PAD
    const rightX = PAD + W + ARROW
    out.push(`<text x="${PAD}" y="${top + 12}" font-size="12" font-weight="600" fill="${INK}">${esc(row.title)}</text>`)
    out.push(cell({ x: leftX, y, w: W, theme: row.theme, children: iconGroup({ ox: 8, oy: 8, scale, state: 'none', theme: row.theme }) }))
    out.push(cell({ x: rightX, y, w: W, theme: row.theme, children: iconGroup({ ox: 8, oy: 8, scale, state: 'done', theme: row.theme }) }))
    const ay = y + W / 2
    out.push(`<path d="M ${leftX + W + 11} ${ay} L ${leftX + W + ARROW - 21} ${ay}" stroke="${MUTED}" stroke-width="1.5" marker-end="url(#arrow)"/>`)
    out.push(`<text x="${leftX + W / 2}" y="${y + W + 15}" text-anchor="middle" font-size="11" fill="${MUTED}">叠加前</text>`)
    out.push(`<text x="${rightX + W / 2}" y="${y + W + 15}" text-anchor="middle" font-size="11" fill="${MUTED}">叠加后</text>`)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">
<defs>${markerDefs('arrow', MUTED)}</defs>
${out.join('\n')}
</svg>
`
}

// ---- Fig 3: architecture ---------------------------------------------
function figFlow() {
  const width = 764, height = 356
  const box = (x, y, w, h, fill = '#ffffff', stroke = LINE) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`
  /** One labelled row: title on the first baseline, detail inside the same box. */
  const row = (x, y, w, title, detail, fill = '#f1f5f9') => {
    const h = detail === undefined ? 32 : 46
    const parts = [`<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${LINE}" stroke-width="1"/>
     <text x="${x + 12}" y="${y + (detail === undefined ? 21 : 19)}" font-size="11.5" fill="${INK}">${esc(title)}</text>`]
    if (detail !== undefined) parts.push(`<text x="${x + 12}" y="${y + 35}" font-size="10.5" fill="${MUTED}">${esc(detail)}</text>`)
    parts.push('</g>')
    return parts.join('')
  }
  const chip = (x, y, w, text) =>
    `<g><rect x="${x}" y="${y}" width="${w}" height="24" rx="6" fill="#ffffff" stroke="${LINE}" stroke-width="1"/>
     <text x="${x + 9}" y="${y + 16}" font-size="10.5" fill="${INK}">${esc(text)}</text></g>`
  const arrow = (x1, y1, x2, y2) =>
    `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${MUTED}" stroke-width="1.5" marker-end="url(#arrow)"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">
<defs>${markerDefs('arrow', MUTED)}</defs>

${box(24, 38, 306, 224, '#ffffff')}
<text x="38" y="62" font-size="13" font-weight="700" fill="${INK}">Host 半边（Node 进程）</text>
${chip(38, 74, 148, 'agent/status')}
${chip(194, 74, 108, 'agent/error')}
${chip(38, 104, 148, 'approval/request')}
${chip(194, 104, 122, 'user-questions/request')}
${row(38, 140, 278, '每会话状态机', 'idle / running / asking / done / error + since')}
${row(38, 196, 278, 'GET /dsh-session-favicon.json', '{ aggregate, sessions: { id: { state, since } } }')}
${arrow(120, 128, 120, 140)}
${arrow(120, 186, 120, 196)}

${arrow(318, 219, 420, 219)}
<text x="322" y="211" font-size="10.5" fill="${MUTED}">同源 JSON</text>

${box(424, 38, 316, 224, '#ffffff')}
<text x="438" y="62" font-size="13" font-weight="700" fill="${INK}">浏览器（每个标签页各一份）</text>
${row(438, 74, 288, 'Slot props.sessionId', '本标签页正在看哪个会话', '#eff6ff')}
${row(438, 130, 288, '每 800ms 轮询', '只取 sessions[自己的 id] 这一行')}
${row(438, 186, 288, 'canvas 合成', '原图标 + 右下角徽标', '#f1f5f9')}
${arrow(582, 120, 582, 130)}
${arrow(582, 176, 582, 186)}

<text x="24" y="292" font-size="12" font-weight="600" fill="${INK}">关键点：会话身份只来自 Slot props，不来自 URL</text>
<text x="24" y="312" font-size="11" fill="${MUTED}">DSH web 没有会话路由，所有标签页共享同一份宿主快照；所以每个标签页必须自己取自己那一行。</text>
<text x="24" y="332" font-size="11" fill="${MUTED}">A 标签页读 sessions[A]、B 标签页读 sessions[B]，图标互不影响——这就是与现有同类插件的差别。</text>
</svg>
`
}

// ---- guards -----------------------------------------------------------
function assertExtents(name, svg, width, height) {
  const num = (tag, attr) => {
    const m = tag.match(new RegExp(attr + '="(-?[0-9.]+)"'))
    return m === null ? undefined : Number(m[1])
  }
  const problems = []
  for (const tag of svg.match(/<circle[^>]*>/g) ?? []) {
    const cx = num(tag, 'cx'), cy = num(tag, 'cy'), r = num(tag, 'r')
    if (cx === undefined || cy === undefined || r === undefined) continue
    if (cx - r < -0.5 || cy - r < -0.5 || cx + r > width + 0.5 || cy + r > height + 0.5) problems.push(`circle out of canvas ${cx},${cy},${r}`)
  }
  for (const tag of svg.match(/<rect[^>]*>/g) ?? []) {
    const x = num(tag, 'x'), y = num(tag, 'y'), w = num(tag, 'width'), h = num(tag, 'height')
    if (x === undefined || y === undefined || w === undefined || h === undefined) continue
    if (x + w > width + 0.5 || y + h > height + 0.5) problems.push(`rect out of canvas ${x},${y},${w},${h}`)
  }
  for (const tag of svg.match(/<text[^>]*>/g) ?? []) {
    const y = num(tag, 'y')
    if (y !== undefined && y > height - 1) problems.push(`text below canvas y=${y}`)
  }
  console.log(name, problems.length === 0 ? 'extents OK' : `PROBLEMS: ${problems.slice(0, 5).join('; ')}`)
}

/** Every translated cell must match its own rect, or icons stack on cell 1. */
function assertCells(name, svg) {
  const cells = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="(\d+)" height="\3" rx="14"[^>]*\/>\s*<g transform="translate\(([\d.]+),([\d.]+)\)"/g)]
  const bad = cells.filter((m) => m[1] !== m[4] || m[2] !== m[5])
  console.log(name, `cells=${cells.length}`, bad.length === 0 ? 'translate OK' : `MISALIGNED: ${bad.length}`)
}

const statesSvg = figStates()
const themesSvg = figThemes()
const flowSvg = figFlow()

assertCells('states.svg', statesSvg)
assertCells('themes.svg', themesSvg)
assertExtents('states.svg', statesSvg, ...(() => {
  const m = statesSvg.match(/width="(\d+)" height="(\d+)" viewBox/)
  return [Number(m[1]), Number(m[2])]
})())
assertExtents('themes.svg', themesSvg, ...(() => {
  const m = themesSvg.match(/width="(\d+)" height="(\d+)" viewBox/)
  return [Number(m[1]), Number(m[2])]
})())
assertExtents('flow.svg', flowSvg, ...(() => {
  const m = flowSvg.match(/width="(\d+)" height="(\d+)" viewBox/)
  return [Number(m[1]), Number(m[2])]
})())

writeFileSync(`${OUT}/states.svg`, statesSvg)
writeFileSync(`${OUT}/themes.svg`, themesSvg)
writeFileSync(`${OUT}/flow.svg`, flowSvg)
console.log('written')
