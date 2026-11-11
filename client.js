/**
 * dsh-session-favicon — Client half.
 *
 * Reports ONE Session's state in the tab favicon: the Session this tab is
 * showing, not the workspace aggregate. With several DSH tabs open, each tab
 * reads its own row out of the Host snapshot, so the icons no longer move in
 * lockstep.
 *
 * Session identity comes from the Slot system: a `conversation.composer.dock`
 * entry is Session-scoped, and every Session-scoped entry receives
 * `sessionId` in its props (`uiSession`'s built-in source publishes
 * `props: { sessionId: binding.sessionId }`). That binding is the main view's
 * current Session for THIS peer, which is exactly the tab identity we need.
 * The entry renders nothing; it only feeds the painter.
 *
 * States:
 *
 *   idle     no Session bound, or nothing to report — original icon untouched
 *   running  a spinner in the bottom-right 3/5 of the icon
 *   asking   an amber dot there (permission ask or `ask_user_question` pending)
 *   done     a green dot there
 *   error    a red dot there
 *
 * The base artwork is the page's own favicon: every existing `link[rel~="icon"]`
 * is captured at startup, composited into a canvas together with the badge, and
 * restored on dispose. Spinner frames are pre-rendered once and cached, so
 * repainting is a `href` swap on an already-encoded data URL.
 *
 * `done` / `error` are notifications: they are only shown when they happened
 * while this page was open, so reloading into a Session that already finished
 * still leaves the icon alone.
 */

;(function installSessionFavicon() {
  const loader = typeof window === 'undefined' ? undefined : window.__ModuleLoader__
  if (!loader || typeof loader.load !== 'function') return

  loader.load({
    id: 'dsh-session-favicon',
    factory: function factory(require) {
      const React = require('react')
      const { useEffect } = React

      /** Matches `STATUS_PATH` in the Host half. */
      const STATUS_PATH = '/dsh-session-favicon.json'
      /** Poll period for the Host snapshot. */
      const POLL_MS = 800
      /** Spinner rev/s: one full revolution per second. */
      const FRAMES = 12
      const FRAME_MS = Math.round(1000 / FRAMES)
      /** Rendered icon edge, in device-independent pixels. */
      const SIZE = 64
      /** Badge centre and radius, as fractions of SIZE: the bottom-right 3/5. */
      const CX = 0.70
      const CY = 0.70
      const R = 0.24
      const DOT_COLORS = { done: '#22c55e', asking: '#f59e0b', error: '#ef4444' }
      const SPIN_COLOR = '#3b82f6'
      /**
       * Badge plate, per color scheme. The page ships two favicons — a black
       * whale for light mode and a white one for dark mode, selected by
       * `media="(prefers-color-scheme: …)"` — so the badge must read against BOTH
       * a white body and a dark tab strip. A plate in the scheme's own tone keeps
       * the coloured marker legible either way.
       */
      const PLATES = {
        light: { fill: 'rgba(255,255,255,0.94)', ring: 'rgba(15,23,42,0.22)' },
        dark: { fill: 'rgba(15,23,42,0.88)', ring: 'rgba(255,255,255,0.28)' },
      }
      /** Slot seat the Session binding is read from. */
      const SLOT = 'conversation.composer.dock'

      // -- Tab identity ------------------------------------------------------
      // Written by the Session-scoped Slot entry, read by the painter. One tab
      // shows one Session, so a single slot value is the whole state.

      const tab = { sessionId: undefined, changed: () => {} }

      /** Session name for this tab, or undefined with no Session bound. */
      function SessionBinder(props) {
        const sessionId = props !== null && typeof props === 'object' && typeof props.sessionId === 'string'
          ? props.sessionId
          : undefined
        useEffect(() => {
          tab.sessionId = sessionId
          tab.changed()
          return () => {
            if (tab.sessionId === sessionId) {
              tab.sessionId = undefined
              tab.changed()
            }
          }
        }, [sessionId])
        return null
      }

      // -- Painter -----------------------------------------------------------

      function createPainter() {
        const doc = document
        const loadedAt = Date.now()

        /** @type {Array<{ el: HTMLLinkElement, href: string | null, media: string | null }>} */
        const originals = []
        /** @type {Array<HTMLImageElement | null>} */
        let bases = []
        /** False until every original icon settled, so no frame bakes in a placeholder. */
        let basesReady = false
        /** `${index}|${state}|${frame}` → encoded icon. */
        const cache = new Map()
        let current = 'idle'
        let stopped = false
        let inFlight = false

        // -- Original icon capture / restore ---------------------------------

        const capture = () => {
          for (const el of doc.querySelectorAll('link[rel~="icon"]')) {
            originals.push({ el, href: el.getAttribute('href'), media: el.getAttribute('media') })
          }
          if (originals.length === 0) {
            const el = doc.createElement('link')
            el.rel = 'icon'
            doc.head.appendChild(el)
            originals.push({ el, href: null, media: null })
          }
        }

        const restore = () => {
          for (const record of originals) {
            if (record.href === null) record.el.removeAttribute('href')
            else record.el.setAttribute('href', record.href)
            if (record.media === null) record.el.removeAttribute('media')
            else record.el.setAttribute('media', record.media)
          }
          cache.clear()
        }

        const loadIcon = (record) => new Promise((resolve) => {
          const src = record.href === null
            ? new URL('/favicon.svg', doc.baseURI).href
            : new URL(record.href, doc.baseURI).href
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => resolve(null)
          image.src = src
        })

        // -- Rendering -------------------------------------------------------

        /**
         * Which colour scheme one captured link belongs to. DSH declares the dark
         * whale first and the light one second, so the media query — not document
         * order — is the only authority.
         */
        const isDarkLink = (record) => record.media !== null && /dark/i.test(record.media)

        const renderFrame = (key, base, state, frame, dark) => {
          const cached = cache.get(key)
          if (cached !== undefined) return cached
          const canvas = doc.createElement('canvas')
          canvas.width = SIZE
          canvas.height = SIZE
          const paint = canvas.getContext('2d')
          let url = null
          if (paint === null) return url
          if (base !== null && base !== undefined) {
            paint.drawImage(base, 0, 0, SIZE, SIZE)
          } else {
            // The page icon could not be decoded: keep an opaque plate so the
            // badge stays legible instead of floating on transparency.
            paint.fillStyle = dark ? '#0f172a' : '#f8fafc'
            paint.beginPath()
            paint.arc(SIZE / 2, SIZE / 2, SIZE * 0.46, 0, Math.PI * 2)
            paint.fill()
          }
          const cx = SIZE * CX
          const cy = SIZE * CY
          const radius = SIZE * R
          const plate = dark ? PLATES.dark : PLATES.light

          // Scheme-toned plate: separates the marker from the whale body (white
          // in dark mode, black in light mode) and from the tab strip behind it.
          // 1.20 × R keeps the ring inside the canvas at CX/CY = 0.70.
          paint.beginPath()
          paint.arc(cx, cy, radius * 1.20, 0, Math.PI * 2)
          paint.fillStyle = plate.fill
          paint.fill()
          paint.lineWidth = Math.max(1, SIZE * 0.028)
          paint.strokeStyle = plate.ring
          paint.stroke()

          if (state === 'running') {
            const arcRadius = radius * 0.82
            const lineWidth = SIZE * 0.075
            const angle = (frame / FRAMES) * Math.PI * 2
            paint.lineCap = 'round'
            paint.lineWidth = lineWidth
            paint.strokeStyle = plate.ring
            paint.beginPath()
            paint.arc(cx, cy, arcRadius, 0, Math.PI * 2)
            paint.stroke()
            paint.strokeStyle = SPIN_COLOR
            paint.beginPath()
            paint.arc(cx, cy, arcRadius, angle, angle + Math.PI * 1.35)
            paint.stroke()
          } else if (DOT_COLORS[state] !== undefined) {
            paint.fillStyle = DOT_COLORS[state]
            paint.beginPath()
            paint.arc(cx, cy, radius * 0.86, 0, Math.PI * 2)
            paint.fill()
          }
          try {
            url = canvas.toDataURL('image/png')
          } catch {
            url = null // a tainted canvas must not break the page
          }
          if (url !== null) cache.set(key, url)
          return url
        }

        const paint = () => {
          const frame = current === 'running'
            ? Math.floor(Date.now() / FRAME_MS) % FRAMES
            : 0
          for (let index = 0; index < originals.length; index += 1) {
            const record = originals[index]
            if (current === 'idle') {
              if (record.href === null) record.el.removeAttribute('href')
              else record.el.setAttribute('href', record.href)
              if (record.media === null) record.el.removeAttribute('media')
              else record.el.setAttribute('media', record.media)
              continue
            }
            const base = basesReady ? bases[index] : undefined
            if (base === undefined) continue // wait for the base artwork instead of caching a placeholder
            const dark = isDarkLink(record)
            const url = renderFrame(`${index}|${current}|${frame}`, base, current, frame, dark)
            if (url === null) continue
            // The link keeps its own `media`: both scheme variants are painted, so
            // the browser still picks black-whale-on-light / white-whale-on-dark.
            record.el.setAttribute('href', url)
          }
        }

        // -- Host snapshot ---------------------------------------------------

        /** Diagnostic handle for "why is my icon not moving": inspect it in the console. */
        const report = () => {
          try {
            window.__DSH_SESSION_FAVICON__ = {
              sessionId: tab.sessionId === undefined ? null : tab.sessionId,
              state: current,
              schemes: originals.map((record) => (isDarkLink(record) ? 'dark' : 'light')),
              preferredScheme: typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
              updatedAt: Date.now(),
            }
          } catch {
            // A frozen window object must not break painting.
          }
        }

        const settle = (state, since) => {
          let next = typeof state === 'string' ? state : 'idle'
          if (next !== 'idle' && next !== 'running' && DOT_COLORS[next] === undefined) next = 'idle'
          if (next === 'done' || next === 'error') {
            // Only a state entered after this page opened is worth showing: a
            // Session re-entered after it finished keeps its original icon.
            if (!(typeof since === 'number' && since > loadedAt)) next = 'idle'
          }
          report()
          if (next === current) return
          current = next
          report()
          paint()
        }

        const poll = async () => {
          if (stopped || inFlight) return
          const sessionId = tab.sessionId
          if (sessionId === undefined) {
            settle('idle', 0)
            return
          }
          inFlight = true
          try {
            const response = await fetch(STATUS_PATH, { cache: 'no-store', credentials: 'same-origin' })
            if (!response.ok) return
            const payload = await response.json()
            const rows = payload !== null && typeof payload === 'object' ? payload.sessions : undefined
            const row = rows !== undefined && rows !== null ? rows[sessionId] : undefined
            // This tab's own row only: an aggregate would move every tab at once.
            settle(row === undefined || row === null ? 'idle' : row.state, row === undefined || row === null ? 0 : row.since)
          } catch {
            // Keep the last painted state; a Host restart must not blank the icon.
          } finally {
            inFlight = false
          }
        }

        /** The bound Session changed: drop the old badge, then read the new row. */
        const refresh = () => {
          if (tab.sessionId === undefined) {
            settle('idle', 0)
            return
          }
          if (current !== 'idle') {
            current = 'idle'
            paint()
          }
          void poll()
        }

        const start = () => {
          capture()
          bases = []
          basesReady = false
          const ready = Promise.all(originals.map(loadIcon)).then((images) => {
            if (stopped) return
            bases = images
            basesReady = true
            paint()
          })
          void ready

          const spin = setInterval(() => {
            if (!stopped && current === 'running') paint()
          }, FRAME_MS)
          const poller = setInterval(() => { void poll() }, POLL_MS)
          const onVisible = () => {
            if (doc.visibilityState === 'visible') void poll()
          }
          doc.addEventListener('visibilitychange', onVisible)
          void poll()

          return () => {
            stopped = true
            clearInterval(spin)
            clearInterval(poller)
            doc.removeEventListener('visibilitychange', onVisible)
            restore()
          }
        }

        return { start, refresh }
      }

      const painter = createPainter()
      tab.changed = () => painter.refresh()

      return {
        inject: ['slots'],
        apply(ctx) {
          ctx.effect(() => painter.start())
          ctx.slots.inject(SLOT, () => ctx.slots.register({
            name: SLOT,
            id: 'session-favicon',
            order: 900,
          }, SessionBinder))
        },
      }
    },
  })
})()
