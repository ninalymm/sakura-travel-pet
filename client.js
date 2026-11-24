/**
 * Client half of the Sakura Travel Pet bundle.
 *
 * Registers a draggable, animated chibi pet into the `shell.overlay` slot. The
 * pet shows a daily recommendation (one local food + one local attraction)
 * fetched from the Host route `/api/sakura-travel/recommendation`, and picks a
 * different original mascot for each ISO week.
 */
window.__ModuleLoader__.load({
  id: '@ninalym13/sakura-travel-pet',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useRef, useState } = React

    const API = '/api/sakura-travel/recommendation'
    const POS_KEY = 'sakura-travel:pos'

    /** Six original Q-version mascots (original art, not licensed characters). */
    const CHARACTERS = [
      { id: 'ying', hair: '#f4a7b9', hair2: '#d97f97', skin: '#ffe9dc', outfit: '#ff6b95', accent: '#ffd23f', eye: '#4fae6b', blush: '#ff9fb0', accessory: 'star' },
      { id: 'lang', hair: '#8a6a4a', hair2: '#6b5037', skin: '#ffe6d4', outfit: '#4a9d72', accent: '#d9b45c', eye: '#3f74c9', blush: '#f2a08c', accessory: 'talisman' },
      { id: 'zhi', hair: '#6f6f9e', hair2: '#54547c', skin: '#ffe9dc', outfit: '#9b7bd6', accent: '#e6d0f5', eye: '#7a5ad6', blush: '#f0a9c9', accessory: 'camera' },
      { id: 'jin', hair: '#f6c445', hair2: '#d9a232', skin: '#ffe9dc', outfit: '#f6a623', accent: '#fff3cd', eye: '#d98324', blush: '#f6b26b', accessory: 'wings' },
      { id: 'yue', hair: '#e9eef7', hair2: '#c3cde4', skin: '#fff3ee', outfit: '#b9c8e8', accent: '#7a90d6', eye: '#5a7ad6', blush: '#f0b9c9', accessory: 'moon' },
      { id: 'hong', hair: '#d94f5a', hair2: '#b13a44', skin: '#ffe9dc', outfit: '#c8353f', accent: '#ffd23f', eye: '#b03040', blush: '#ff9aa0', accessory: 'ribbon' },
    ]

    function isoWeek(date) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
      const dayNum = d.getUTCDay() || 7
      d.setUTCDate(d.getUTCDate() + 4 - dayNum)
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
      return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
    }

    function characterForWeek(now) {
      return CHARACTERS[isoWeek(now) % CHARACTERS.length]
    }

    function readPos() {
      try {
        const raw = localStorage.getItem(POS_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
      } catch { /* ignore */ }
      return null
    }

    function writePos(pos) {
      try {
        if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos))
      } catch { /* ignore */ }
    }

    const CSS = `
.skt-root{position:absolute;z-index:40;pointer-events:auto;font-family:var(--dsh-font-family-ui,system-ui,-apple-system,Segoe UI,Roboto,sans-serif)}
.skt-root *{box-sizing:border-box}
.skt-bubble{position:absolute;bottom:calc(100% + 14px);right:-24px;width:262px;background:rgba(255,255,255,0.97);color:#23262b;border:1px solid rgba(0,0,0,0.08);border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,0.16);padding:12px 12px 10px;animation:skt-pop .18s ease-out}
body[data-ds-dark-theme] .skt-bubble{background:rgba(32,34,40,0.97);color:#e8e8e8;border-color:rgba(255,255,255,0.1);box-shadow:0 8px 28px rgba(0,0,0,0.5)}
.skt-bubble::after{content:"";position:absolute;right:34px;bottom:-8px;width:14px;height:14px;background:inherit;border-right:1px solid rgba(0,0,0,0.08);border-bottom:1px solid rgba(0,0,0,0.08);transform:rotate(45deg)}
body[data-ds-dark-theme] .skt-bubble::after{border-color:rgba(255,255,255,0.1)}
.skt-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.skt-name{font-weight:700;font-size:13px;line-height:1.2}
.skt-city{font-size:12px;opacity:.68;line-height:1.2}
.skt-tools{margin-left:auto;display:flex;gap:4px}
.skt-btn{appearance:none;border:none;background:rgba(0,0,0,0.06);color:inherit;width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center}
body[data-ds-dark-theme] .skt-btn{background:rgba(255,255,255,0.12)}
.skt-btn:hover{background:rgba(0,0,0,0.12)}
.skt-row{margin-bottom:8px}
.skt-label{font-size:11px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;opacity:.6;margin-bottom:2px}
.skt-value{font-size:13px;font-weight:600;line-height:1.35}
.skt-why{font-size:12px;line-height:1.45;opacity:.82;margin-top:1px}
.skt-msg{font-size:12.5px;line-height:1.5;opacity:.85}
.skt-hint{position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);white-space:nowrap;font-size:11px;color:var(--dsw-alias-text-secondary,#666);background:var(--dsw-alias-bg-elevated,rgba(255,255,255,.9));padding:3px 8px;border-radius:8px;opacity:0;transition:opacity .15s;pointer-events:none}
.skt-body{position:relative;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none}
.skt-body:hover .skt-hint{opacity:1}
.skt-body:active{cursor:grabbing}
.skt-svg{display:block;animation:skt-bob 3.2s ease-in-out infinite}
.skt-eyes{transform-box:fill-box;transform-origin:center;animation:skt-blink 4.6s infinite}
@keyframes skt-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes skt-blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(0.08)}}
@keyframes skt-pop{0%{transform:scale(.92);opacity:0}100%{transform:scale(1);opacity:1}}
.skt-body.skt-hop{animation:skt-hop .55s ease-out}
.skt-body.skt-drag{animation:skt-wobble .5s ease-in-out infinite}
@keyframes skt-hop{0%{transform:translateY(0) scale(1,1)}30%{transform:translateY(-16px) scale(.9,1.12)}60%{transform:translateY(0) scale(1.12,.86)}80%{transform:translateY(-4px) scale(.98,1.02)}100%{transform:translateY(0) scale(1,1)}}
@keyframes skt-wobble{0%,100%{transform:rotate(-4deg) scale(1.05)}50%{transform:rotate(4deg) scale(1.08)}}
`

    function accessory(char) {
      const a = char.accessory
      const c = char.accent
      if (a === 'star') {
        return h('polygon', { points: '60,11 63.2,18 71,18 65,22.6 67,30 60,25.4 53,30 55,22.6 49,18 56.8,18', fill: c })
      }
      if (a === 'talisman') {
        return h('g', { transform: 'translate(60 21) rotate(45)' },
          h('rect', { x: -5, y: -9, width: 10, height: 18, rx: 1.5, fill: c }),
        )
      }
      if (a === 'camera') {
        return h('g', { transform: 'translate(60 21)' },
          h('rect', { x: -10, y: -6, width: 20, height: 13, rx: 2.5, fill: c }),
          h('circle', { cx: 0, cy: 0, r: 3.6, fill: char.hair2 }),
          h('circle', { cx: 0, cy: 0, r: 1.6, fill: '#ffffff' }),
        )
      }
      if (a === 'wings') {
        return h('g', null,
          h('ellipse', { cx: 41, cy: 25, rx: 8, ry: 5, fill: c, transform: 'rotate(-24 41 25)' }),
          h('ellipse', { cx: 79, cy: 25, rx: 8, ry: 5, fill: c, transform: 'rotate(24 79 25)' }),
        )
      }
      if (a === 'moon') {
        return h('g', null,
          h('circle', { cx: 60, cy: 21, r: 9, fill: c }),
          h('circle', { cx: 64, cy: 17, r: 7, fill: char.hair }),
        )
      }
      if (a === 'ribbon') {
        return h('g', { transform: 'translate(60 21)' },
          h('path', { d: 'M 0 0 L -10 -7 L -10 5 Z', fill: c }),
          h('path', { d: 'M 0 0 L 10 -7 L 10 5 Z', fill: c }),
          h('circle', { cx: 0, cy: 0, r: 3.2, fill: char.hair2 }),
        )
      }
      return null
    }

    function Chibi({ char }) {
      return h('svg', {
        className: 'skt-svg', viewBox: '0 0 120 150', width: 120, height: 150,
        role: 'img', 'aria-label': char.id,
      },
        h('circle', { cx: 60, cy: 44, r: 36, fill: char.hair2 }),
        h('path', { d: 'M 30 116 Q 30 90 60 90 Q 90 90 90 116 L 90 138 Q 60 148 30 138 Z', fill: char.outfit }),
        h('circle', { cx: 60, cy: 52, r: 32, fill: char.skin }),
        h('path', { d: 'M 30 52 Q 30 30 60 30 Q 90 30 90 52 Q 84 43 60 43 Q 36 43 30 52 Z', fill: char.hair }),
        accessory(char),
        h('g', { className: 'skt-eyes' },
          h('ellipse', { cx: 48, cy: 56, rx: 4.6, ry: 6.6, fill: char.eye }),
          h('ellipse', { cx: 72, cy: 56, rx: 4.6, ry: 6.6, fill: char.eye }),
          h('circle', { cx: 49.6, cy: 53.4, r: 1.6, fill: '#ffffff' }),
          h('circle', { cx: 73.6, cy: 53.4, r: 1.6, fill: '#ffffff' }),
        ),
        h('circle', { cx: 41, cy: 66, r: 4, fill: char.blush, opacity: 0.55 }),
        h('circle', { cx: 79, cy: 66, r: 4, fill: char.blush, opacity: 0.55 }),
        h('path', { d: 'M 55 67 Q 60 72 65 67', fill: 'none', stroke: '#7a4a3a', strokeWidth: 2, strokeLinecap: 'round' }),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          try {
            return ctx.locale.register('sakura-travel', {
          zh: {
            'char.ying': '桃桃', 'char.lang': '青岚', 'char.zhi': '紫苏',
            'char.jin': '金团', 'char.yue': '银月', 'char.hong': '红菱',
            title: '今日推荐', food: '美食', attraction: '景点',
            loading: '正在准备今日推荐…', refresh: '换一个',
            'err.location': '定位失败，请在插件配置里填写城市（config.city）。',
            'err.noModel': '没有可用模型，请先在“设置 → 模型”中配置。',
            'err.generic': '出错了：{msg}',
          },
          en: {
            'char.ying': 'Peach', 'char.lang': 'Azure', 'char.zhi': 'Lilac',
            'char.jin': 'Goldie', 'char.yue': 'Luna', 'char.hong': 'Ruby',
            title: "Today's pick", food: 'Food', attraction: 'Spot',
            loading: 'Preparing today’s pick…', refresh: 'Refresh',
            'err.location': 'Could not detect your location. Set a city in the plugin config (config.city).',
            'err.noModel': 'No model available. Configure one in Settings → Models first.',
            'err.generic': 'Something went wrong: {msg}',
          },
            })
          } catch (error) {
            if (error && /already has locale/.test(error.message)) return () => {}
            throw error
          }
        }, 'sakura-travel: locale')
        const t = ctx.locale.bind('sakura-travel')

        function Pet() {
          const [data, setData] = useState(null)
          const [error, setError] = useState(null)
          const [loading, setLoading] = useState(true)
          const [collapsed, setCollapsed] = useState(false)
          const [pos, setPos] = useState(readPos)
          const posRef = useRef(pos)
          const [, forceRender] = useState(0)
          const rootRef = useRef(null)
          const drag = useRef(null)
          const moved = useRef(false)
          const [hop, setHop] = useState(false)
          const [dragging, setDragging] = useState(false)
          const hopTimer = useRef(null)

          const char = useMemo(() => characterForWeek(new Date()), [])

          useEffect(() => ctx.locale.subscribe(() => forceRender(n => n + 1)), [])
          useEffect(() => () => { if (hopTimer.current) clearTimeout(hopTimer.current) }, [])

          function doHop() {
            setHop(true)
            if (hopTimer.current) clearTimeout(hopTimer.current)
            hopTimer.current = setTimeout(() => setHop(false), 600)
          }

          function load(refresh) {
            setLoading(true)
            setError(null)
            const url = refresh ? `${API}?refresh=1` : API
            fetch(url)
              .then(res => res.json())
              .then(json => {
                if (json && json.error) setError(json.error)
                else setData(json)
              })
              .catch(err => setError(err && err.message ? err.message : String(err)))
              .finally(() => setLoading(false))
          }

          useEffect(() => { load(false) }, [])

          function onPointerDown(e) {
            if (e.button !== 0) return
            const root = rootRef.current
            if (!root) return
            const rect = root.getBoundingClientRect()
            const anchor = root.offsetParent || root.parentElement
            const anchorRect = anchor ? anchor.getBoundingClientRect() : { left: 0, top: 0 }
            const next = { x: rect.left - anchorRect.left, y: rect.top - anchorRect.top }
            posRef.current = next
            setPos(next)
            moved.current = false
            setDragging(true)
            drag.current = { sx: e.clientX, sy: e.clientY, x: next.x, y: next.y }
            e.currentTarget.setPointerCapture(e.pointerId)
          }
          function onPointerMove(e) {
            const d = drag.current
            if (!d) return
            const nx = d.x + (e.clientX - d.sx)
            const ny = d.y + (e.clientY - d.sy)
            if (Math.abs(nx - d.x) + Math.abs(ny - d.y) > 3) moved.current = true
            posRef.current = { x: nx, y: ny }
            setPos({ x: nx, y: ny })
          }
          function endDrag(commit) {
            if (!drag.current) return
            if (commit) writePos(posRef.current)
            drag.current = null
            setDragging(false)
          }
          function onPointerUp() { endDrag(true) }
          function onPointerCancel() { endDrag(false) }

          const errMsg = error
            ? (error === 'LOCATION_UNAVAILABLE' ? t('err.location')
              : (error.startsWith('NO_LLM') ? t('err.noModel') : t('err.generic', { msg: error })))
            : null

          const name = t(`char.${char.id}`)
          const city = data && data.location ? data.location.city : ''

          return h('div', {
            ref: rootRef,
            className: 'skt-root',
            style: pos
              ? { position: 'absolute', left: pos.x, top: pos.y }
              : { position: 'absolute', right: 32, bottom: 32 },
          },
            !collapsed && h('div', { className: 'skt-bubble' },
              h('div', { className: 'skt-head' },
                h('div', null,
                  h('div', { className: 'skt-name' }, `${name} · ${t('title')}`),
                  city ? h('div', { className: 'skt-city' }, city) : null,
                ),
                h('div', { className: 'skt-tools' },
                  h('button', { className: 'skt-btn', title: t('refresh'), onClick: () => load(true) }, '↻'),
                  h('button', { className: 'skt-btn', title: '×', onClick: () => setCollapsed(true) }, '×'),
                ),
              ),
              loading
                ? h('div', { className: 'skt-msg' }, t('loading'))
                : errMsg
                  ? h('div', { className: 'skt-msg' }, errMsg)
                  : data && data.raw
                    ? h('div', { className: 'skt-msg' }, data.raw)
                    : data
                      ? h('div', null,
                          h('div', { className: 'skt-row' },
                            h('div', { className: 'skt-label' }, t('food')),
                            h('div', { className: 'skt-value' }, data.food && data.food.name),
                            data.food && data.food.why ? h('div', { className: 'skt-why' }, data.food.why) : null,
                          ),
                          h('div', { className: 'skt-row' },
                            h('div', { className: 'skt-label' }, t('attraction')),
                            h('div', { className: 'skt-value' }, data.attraction && data.attraction.name),
                            data.attraction && data.attraction.why ? h('div', { className: 'skt-why' }, data.attraction.why) : null,
                          ),
                        )
                      : null,
            ),
            h('div', {
              className: ['skt-body', hop ? 'skt-hop' : '', dragging ? 'skt-drag' : ''].join(' ').trim(),
              onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
              onClick: () => {
                if (moved.current) return
                doHop()
                setCollapsed(c => !c)
              },
            },
              collapsed ? h('div', { className: 'skt-hint' }, `${name}`) : null,
              h(Chibi, { char }),
            ),
          )
        }

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'sakura-travel-pet', order: 100,
        }, () => h('div', null,
          h('style', null, CSS),
          h(Pet),
        )))
      },
    }
  },
})
