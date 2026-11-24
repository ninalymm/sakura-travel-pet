/**
 * Host half of the Sakura Travel Pet bundle.
 *
 * - Resolves the machine's location (IP geolocation, with a manual city override
 *   from the row config).
 * - Generates a daily "one local food + one local attraction" recommendation
 *   through the configured LLM (`ctx.llm`).
 * - Caches location and the day's recommendation in a JSON file under
 *   `~/.dsh/sakura-travel/state.json`.
 * - Exposes the result to the Web client through an authenticated exact Fetch
 *   route at `/api/sakura-travel/recommendation` (`ctx.connection.fetch`).
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const inject = ['connection', 'llm']

const STATE_FILE = join(homedir(), '.dsh', 'sakura-travel', 'state.json')
const ROUTE_PATH = '/api/sakura-travel/recommendation'
const IP_FETCH_TIMEOUT_MS = 8000

/** Local date as YYYY-MM-DD. */
function today() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function readState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeState(state) {
  await mkdir(dirname(STATE_FILE), { recursive: true })
  const tmp = `${STATE_FILE}.tmp`
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
  await rename(tmp, STATE_FILE)
}

async function fetchJson(url, timeoutMs = IP_FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Resolve a coarse location from the public IP. Returns null when unavailable. */
async function ipLocation() {
  const attempts = [
    async () => {
      const j = await fetchJson('https://ipwho.is/')
      if (j && j.success === true && j.city) {
        return {
          city: j.city,
          region: j.region || j.city,
          country: j.country || '',
          lat: typeof j.latitude === 'number' ? j.latitude : undefined,
          lon: typeof j.longitude === 'number' ? j.longitude : undefined,
        }
      }
      throw new Error('ipwho.is returned no city')
    },
    async () => {
      const j = await fetchJson('https://ipapi.co/json/')
      if (j && j.city) {
        return {
          city: j.city,
          region: j.region || j.city,
          country: j.country_name || '',
          lat: typeof j.latitude === 'number' ? j.latitude : undefined,
          lon: typeof j.longitude === 'number' ? j.longitude : undefined,
        }
      }
      throw new Error('ipapi.co returned no city')
    },
  ]
  for (const attempt of attempts) {
    try {
      return await attempt()
    } catch {
      /* try the next provider */
    }
  }
  return null
}

/** Manual city from config wins; otherwise IP-derived, cached for the day. */
async function getLocation(config, state) {
  const manual = config && config.city ? String(config.city).trim() : ''
  if (manual) {
    return { city: manual, region: '', country: '', source: 'config' }
  }
  const cached = state && state.location
  if (cached && cached.source === 'ip' && cached.fetchedAt === today() && cached.city) {
    return cached
  }
  const loc = await ipLocation()
  if (!loc) throw new Error('LOCATION_UNAVAILABLE')
  return { ...loc, source: 'ip', fetchedAt: today() }
}

/** First usable model id for a provider, or null when the provider lists none. */
async function firstModel(ctx, provider) {
  try {
    const models = await ctx.llm.listModels(provider)
    return models && models.length ? models[0].id : null
  } catch {
    return null
  }
}

/** Resolve the provider/model to use: explicit config wins, else first usable route. */
async function resolveRoute(ctx, config) {
  if (config && config.provider) {
    const provider = String(config.provider)
    const model = (config && config.model) ? String(config.model) : await firstModel(ctx, provider)
    if (!model) throw new Error('NO_LLM_MODEL')
    return { provider, model }
  }
  const providers = ctx.llm.listProviders() || []
  for (const entry of providers) {
    const model = await firstModel(ctx, entry.id)
    if (model) return { provider: entry.id, model }
  }
  throw new Error('NO_LLM_PROVIDER')
}

/**
 * Stream one LLM call and return the assembled visible text. The terminal
 * `finish` chunk carries failures; a thrown stream is also normalized here.
 */
async function generateText(ctx, provider, model, system, userText) {
  let text = ''
  let failure = null
  try {
    for await (const chunk of ctx.llm.stream({
      provider,
      model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    })) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
        failure = chunk.reason.failure
      }
    }
  } catch (error) {
    failure = { code: 'STREAM', message: error && error.message ? error.message : String(error) }
  }
  if (failure) {
    const code = failure.code || ''
    const message = failure.message || ''
    throw new Error(`LLM_FAILED${code ? `:${code}` : ''}${message ? ` ${message}` : ''}`.trim())
  }
  return text
}

function parseRecommendation(text) {
  const trimmed = text.trim()
  // Strip a wrapping ```json ... ``` code fence if the model added one.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1))
      if (parsed && parsed.food && parsed.attraction) {
        return {
          food: {
            name: String(parsed.food.name ?? '').trim(),
            why: String(parsed.food.why ?? '').trim(),
          },
          attraction: {
            name: String(parsed.attraction.name ?? '').trim(),
            why: String(parsed.attraction.why ?? '').trim(),
          },
        }
      }
    } catch {
      /* fall through to raw */
    }
  }
  return { food: { name: '', why: '' }, attraction: { name: '', why: '' }, raw: trimmed }
}

async function generateRecommendation(ctx, config, location) {
  const { provider, model } = await resolveRoute(ctx, config)
  const place = [location.city, location.region, location.country].filter(Boolean).join('、')
  const prompt = [
    '你是一位熟悉当地生活的旅行美食达人。',
    `请为「${place}」推荐今天最值得体验的内容：`,
    '1. 一道当地特色美食（写清楚名称，并用一句话说明为什么值得吃）；',
    '2. 一个当地旅游景点（写清楚名称，并用一句话说明为什么值得去）。',
    '',
    '只输出一个 JSON 对象，不要输出任何其他文字、代码块或注释，格式如下：',
    '{"food":{"name":"...","why":"..."},"attraction":{"name":"...","why":"..."}}',
  ].join('\n')
  const text = await generateText(
    ctx,
    provider,
    model,
    '你是一个乐于助人的本地生活推荐助手，回复保持简洁、具体、地道，使用与用户相同的语言。',
    prompt,
  )
  return parseRecommendation(text)
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export function apply(ctx, config = {}) {
  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const url = new URL(request.url)
        const forceRefresh = url.searchParams.get('refresh') === '1'
        try {
          const state = await readState()
          const location = await getLocation(config, state)
          const date = today()

          let recommendation = state && state.recommendation
          if (
            !recommendation ||
            recommendation.date !== date ||
            recommendation.city !== location.city ||
            forceRefresh
          ) {
            const generated = await generateRecommendation(ctx, config, location)
            recommendation = {
              ...generated,
              date,
              city: location.city,
              generatedAt: new Date().toISOString(),
            }
            await writeState({ ...state, location, recommendation })
          }

          return jsonResponse({
            date,
            location: {
              city: location.city,
              region: location.region || '',
              country: location.country || '',
              source: location.source,
            },
            food: recommendation.food,
            attraction: recommendation.attraction,
            ...(recommendation.raw ? { raw: recommendation.raw } : {}),
          })
        } catch (error) {
          const message = error && error.message ? error.message : String(error)
          return jsonResponse({ error: message }, 502)
        }
      },
    })
    return () => {
      void dispose()
    }
  }, 'sakura-travel: recommendation fetch route')
}
