/**
 * dsh-session-favicon — Host half.
 *
 * Collects one live state per Session from Host events and serves the aggregate
 * on a same-origin JSON route. The Client half (`./client`) polls that route and
 * repaints the tab favicon.
 *
 * States (priority high → low): `asking` > `error` > `running` > `done` > `idle`.
 *
 *   asking   a permission ask or an `ask_user_question` request is pending
 *   running  the Agent is executing a turn
 *   error    the last turn settled with an error (or the Agent failed outside one)
 *   done     the last turn settled cleanly
 *   idle     nothing to report
 *
 * The payload carries the aggregate plus one row per non-idle Session, so the
 * Client can later narrow the badge to its own Session without a protocol change.
 *
 * Nothing here reads or rewrites the profile's `cordis.patch.yml`, and the route
 * exposes only state names and timestamps — never session titles or content.
 */

const STATUS_PATH = '/dsh-session-favicon.json'

/** Aggregate priority: lower wins. */
const RANK = { asking: 0, error: 1, running: 2, done: 3, idle: 4 }

/**
 * How long a settled (`done` / `error`) state keeps driving the aggregate. A
 * settled state is a notification, not a durable fact: once it has sat unseen
 * this long it decays to `idle` so an old green or red dot cannot mask a live
 * Session. The Client applies its own "only show states that happened while this
 * page was open" rule on top of the `since` timestamps.
 */
const SETTLED_TTL_MS = 30 * 60 * 1000

/** Required: the browser HTTP carrier that owns the status route. */
export const inject = ['webServer']

export function apply(ctx) {
  /** @type {Map<string, { state: string, since: number, running: boolean, waiting: number, errored: boolean, settled: boolean }>} */
  const sessions = new Map()

  const entry = (id) => {
    let row = sessions.get(id)
    if (row === undefined) {
      row = { state: 'idle', since: Date.now(), running: false, waiting: 0, errored: false, settled: false }
      sessions.set(id, row)
    }
    return row
  }

  /** Re-derive one Session's state from its flags; a changed state restamps `since`. */
  const recompute = (id) => {
    const row = entry(id)
    const next = row.waiting > 0
      ? 'asking'
      : row.running
        ? 'running'
        : row.errored
          ? 'error'
          : row.settled
            ? 'done'
            : 'idle'
    if (row.state !== next) {
      row.state = next
      row.since = Date.now()
    }
  }

  /** One consistent cut for the Client. Also drops rows whose settled state expired. */
  const snapshot = () => {
    const now = Date.now()
    const rows = {}
    let aggregate = 'idle'
    let aggregateSince = 0
    for (const [id, row] of sessions) {
      let state = row.state
      if (state === 'done' || state === 'error') {
        if (now - row.since > SETTLED_TTL_MS) {
          sessions.delete(id)
          continue
        }
      }
      if (state === 'idle') continue
      rows[id] = { state, since: row.since }
      if (RANK[state] < RANK[aggregate]) {
        aggregate = state
        aggregateSince = row.since
      }
    }
    return { v: 1, now, aggregate, aggregateSince, sessions: rows }
  }

  // -- State sources -------------------------------------------------------

  // `running` ⇄ `idle` for one Agent. Entering a turn clears a previous error;
  // leaving it settles the turn (clean or errored).
  ctx.on('agent/status', (payload) => {
    const id = payload?.agent?.id
    if (id === undefined) return
    const row = entry(id)
    const running = payload.status === 'running'
    if (running && !row.running) row.errored = false
    if (!running && row.running) row.settled = true
    row.running = running
    recompute(id)
  })

  // A step or turn errored: red once the Agent stops running.
  ctx.on('agent/error', (payload) => {
    const id = payload?.agent?.id
    if (id === undefined) return
    entry(id).errored = true
    recompute(id)
  })

  // An Agent that failed outside a durable turn position.
  ctx.on('api-session/error', (sessionId) => {
    if (sessionId === undefined) return
    entry(sessionId).errored = true
    entry(sessionId).settled = true
    recompute(sessionId)
  })

  // Fallback running signal, for a Session whose Agent status we never saw.
  ctx.on('api-session/status', (sessionId, running) => {
    if (sessionId === undefined) return
    const row = entry(sessionId)
    if (running && !row.running) row.errored = false
    if (!running && row.running) row.settled = true
    row.running = running === true
    recompute(sessionId)
  })

  // A Session left the live registry. Keep a row that settled so its `done` /
  // `error` notification survives the Agent (the expiry in `snapshot` collects
  // it); an Agent disposed mid-turn counts as settled, because nothing is
  // running for it any more.
  ctx.on('agent/disposed', (payload) => {
    const id = payload?.agent?.id
    if (id === undefined) return
    const row = sessions.get(id)
    if (row === undefined) return
    if (row.running) {
      row.running = false
      row.settled = true
    }
    row.waiting = 0
    recompute(id)
    if (row.state === 'idle') sessions.delete(id)
  })

  // -- "Needs the user" gates ---------------------------------------------
  // Both are waterfalls that another composed answerer claims; we only observe
  // the pending window, so we always delegate with `next()`.

  ctx.on('approval/request', async (req, next) => {
    const id = req?.agent?.id
    if (id === undefined) return next()
    const row = entry(id)
    row.waiting += 1
    recompute(id)
    try {
      return await next()
    } finally {
      row.waiting = Math.max(0, row.waiting - 1)
      recompute(id)
    }
  })

  ctx.on('user-questions/request', async (request, next) => {
    const id = request?.agent?.id
    if (id === undefined) return next()
    const row = entry(id)
    row.waiting += 1
    recompute(id)
    try {
      return await next()
    } finally {
      row.waiting = Math.max(0, row.waiting - 1)
      recompute(id)
    }
  })

  // -- Transport -----------------------------------------------------------

  // Seed from Agents that were already running when this plugin mounted (a
  // profile reload or Host restart mid-turn emits no `agent/status`). The
  // runtime Agent face carries `status`; the public interface only declares
  // `id`, so this stays guarded and degrades to event-only tracking.
  const seed = ctx.get('agents')
  if (seed !== undefined && typeof seed.list === 'function') {
    for (const agent of seed.list()) {
      const id = agent?.id
      if (id === undefined || agent.status !== 'running') continue
      entry(id).running = true
      recompute(id)
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: STATUS_PATH,
    handler: (req, res) => {
      // The page that polls this route is already authenticated; the payload
      // holds no Session content, so it stays readable for the local page even
      // when the Host is reachable over another interface.
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.setHeader('x-content-type-options', 'nosniff')
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(snapshot()))
    },
  }), 'session-favicon: status route')
}
