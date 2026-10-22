export const HEALTH_INSIGHTS_VERSION = 1

const INSIGHTS_KEYS = new Set(['version', 'days', 'sessions'])
const META_KEYS = new Set(['version', 'disclosureAccepted', 'lastReadAt', 'importedSessionIds', 'dayFingerprints', 'permissions'])
const DAY_KEYS = new Set(['date', 'steps', 'distanceM', 'heartRate', 'sources'])
const HEART_RATE_KEYS = new Set(['samples', 'minBpm', 'maxBpm', 'avgBpm'])
const SAMPLE_KEYS = new Set(['beatsPerMinute'])

export function emptyHealthInsights() {
  return { version: HEALTH_INSIGHTS_VERSION, days: {}, sessions: {} }
}

export function emptyHealthMeta() {
  return {
    version: HEALTH_INSIGHTS_VERSION,
    disclosureAccepted: false,
    lastReadAt: null,
    importedSessionIds: {},
    dayFingerprints: {},
    permissions: {},
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function hasOnlyKeys(value, allowed) {
  return Reflect.ownKeys(value).every(key => typeof key === 'string'
    && allowed.has(key)
    && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true)
}

function isLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
}

function round(value, decimals) {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function hasCanonicalArrayKeys(array) {
  const keys = Reflect.ownKeys(array)
  return keys.length === array.length + 1 && keys.every(key => {
    if (key === 'length') return true
    return typeof key === 'string'
      && /^(?:0|[1-9]\d*)$/.test(key)
      && Number(key) < array.length
      && Object.getOwnPropertyDescriptor(array, key)?.enumerable === true
  })
}

function normalizeSources(sources) {
  if (!Array.isArray(sources) || !hasCanonicalArrayKeys(sources)) return null
  const cleaned = sources.map(source => typeof source === 'string' ? source.trim() : '')
  if (cleaned.some(source => !source)) return null
  return [...new Set(cleaned)].sort()
}

function normalizeHeartRate(heartRate) {
  if (!isPlainObject(heartRate) || !hasOnlyKeys(heartRate, HEART_RATE_KEYS)) return null
  const { samples, minBpm, maxBpm, avgBpm } = heartRate
  if (!Number.isInteger(samples) || samples <= 0) return null
  if (![minBpm, maxBpm, avgBpm].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) return null
  const rounded = {
    samples,
    minBpm: round(minBpm, 2),
    maxBpm: round(maxBpm, 2),
    avgBpm: round(avgBpm, 2),
  }
  if (![rounded.minBpm, rounded.maxBpm, rounded.avgBpm].every(value => Number.isFinite(value) && value > 0)) return null
  if (rounded.minBpm > rounded.avgBpm || rounded.avgBpm > rounded.maxBpm) return null
  return rounded
}

export function summarizeHeartRate(samples) {
  if (!Array.isArray(samples) || samples.length === 0 || !hasCanonicalArrayKeys(samples)) return null
  let minBpm = Infinity
  let maxBpm = -Infinity
  let totalBpm = 0
  for (const sample of samples) {
    if (!isPlainObject(sample) || !hasOnlyKeys(sample, SAMPLE_KEYS)) return null
    const bpm = sample.beatsPerMinute
    if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) return null
    if (bpm < minBpm) minBpm = bpm
    if (bpm > maxBpm) maxBpm = bpm
    totalBpm += bpm
  }
  return normalizeHeartRate({
    samples: samples.length,
    minBpm,
    maxBpm,
    avgBpm: totalBpm / samples.length,
  })
}

export function normalizeHealthDay(raw) {
  if (!isPlainObject(raw) || !hasOnlyKeys(raw, DAY_KEYS) || !isLocalDate(raw.date)) return null
  if (!('steps' in raw || 'distanceM' in raw || 'heartRate' in raw)) return null
  const normalized = { date: raw.date }

  if ('steps' in raw) {
    if (!Number.isInteger(raw.steps) || raw.steps < 0) return null
    normalized.steps = raw.steps
  }
  if ('distanceM' in raw) {
    if (typeof raw.distanceM !== 'number' || !Number.isFinite(raw.distanceM) || raw.distanceM < 0) return null
    const distanceM = round(raw.distanceM, 3)
    if (!Number.isFinite(distanceM) || distanceM < 0) return null
    normalized.distanceM = distanceM
  }
  if ('heartRate' in raw) {
    const heartRate = normalizeHeartRate(raw.heartRate)
    if (!heartRate) return null
    normalized.heartRate = heartRate
  }
  if ('sources' in raw) {
    const sources = normalizeSources(raw.sources)
    if (!sources) return null
    normalized.sources = sources
  }

  return normalized
}

function canonicalStoredDay(day, normalized) {
  if (day.date !== normalized.date) return false

  // The meta fingerprint is a JSON string, so a stored day has to serialise in the same
  // key order as the normalized one or its fingerprint silently disagrees with it.
  const storedKeys = Object.keys(day)
  const normalizedKeys = Object.keys(normalized)
  if (storedKeys.length !== normalizedKeys.length) return false
  if (!storedKeys.every((key, index) => key === normalizedKeys[index])) return false

  for (const field of ['steps', 'distanceM']) {
    if (Object.hasOwn(day, field) !== Object.hasOwn(normalized, field)) return false
    if (Object.hasOwn(day, field) && !Object.is(day[field], normalized[field])) return false
  }

  if (Object.hasOwn(day, 'heartRate') !== Object.hasOwn(normalized, 'heartRate')) return false
  if (day.heartRate) {
    for (const field of ['samples', 'minBpm', 'maxBpm', 'avgBpm']) {
      if (!Object.is(day.heartRate[field], normalized.heartRate[field])) return false
    }
  }

  if (Object.hasOwn(day, 'sources') !== Object.hasOwn(normalized, 'sources')) return false
  return !day.sources || (day.sources.length === normalized.sources.length
    && day.sources.every((source, index) => source === normalized.sources[index]))
}

function validDateMapKeys(map) {
  return Reflect.ownKeys(map).every(key => typeof key === 'string'
    && isLocalDate(key)
    && Object.getOwnPropertyDescriptor(map, key)?.enumerable === true)
}

function validStoredDays(days) {
  return validDateMapKeys(days) && Object.entries(days).every(([date, day]) => {
    const normalized = normalizeHealthDay(day)
    return normalized !== null && normalized.date === date && canonicalStoredDay(day, normalized)
  })
}

function validInsights(insights) {
  return isPlainObject(insights)
    && hasOnlyKeys(insights, INSIGHTS_KEYS)
    && insights.version === HEALTH_INSIGHTS_VERSION
    && isPlainObject(insights.days)
    && validStoredDays(insights.days)
    && isPlainObject(insights.sessions)
    && Reflect.ownKeys(insights.sessions).length === 0
}

function validMeta(meta, insightDays) {
  return isPlainObject(meta)
    && hasOnlyKeys(meta, META_KEYS)
    && meta.version === HEALTH_INSIGHTS_VERSION
    && typeof meta.disclosureAccepted === 'boolean'
    && (meta.lastReadAt === null || typeof meta.lastReadAt === 'string')
    && isPlainObject(meta.importedSessionIds)
    && Reflect.ownKeys(meta.importedSessionIds).length === 0
    && isPlainObject(meta.dayFingerprints)
    && validDateMapKeys(meta.dayFingerprints)
    && Object.entries(meta.dayFingerprints).every(([date, fingerprint]) => fingerprint === JSON.stringify(insightDays[date]))
    && Object.keys(meta.dayFingerprints).length === Object.keys(insightDays).length
    && Object.keys(meta.dayFingerprints).every(date => Object.hasOwn(insightDays, date))
    && isPlainObject(meta.permissions)
    && Reflect.ownKeys(meta.permissions).length === 0
}

function hasLexicographicKeys(map) {
  return validDateMapKeys(map) && Object.keys(map).every((key, index, keys) => index === 0 || keys[index - 1] < key)
}

function canonicalDateMap(map) {
  return Object.fromEntries(Object.entries(map).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
}

function toIsoDate(now) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now)
  if (Number.isNaN(date.getTime())) throw new TypeError('now must be a valid date')
  return date.toISOString()
}

export function reconcileHealthDays(insights, meta, days, now) {
  if (!validInsights(insights)) throw new TypeError('insights must be a valid Health Insights container')
  if (!validMeta(meta, insights.days)) throw new TypeError('meta must be a valid Health Insights metadata container')
  if (!Array.isArray(days) || !hasCanonicalArrayKeys(days)) throw new TypeError('days must be an array')

  const updatedAt = toIsoDate(now)
  const nextDays = { ...insights.days }
  const nextFingerprints = { ...meta.dayFingerprints }
  const counts = { received: days.length, accepted: 0, added: 0, updated: 0, unchanged: 0, rejected: 0 }
  let changed = false
  const normalizedDays = days.map(normalizeHealthDay)
  const dateCounts = new Map()

  for (const day of normalizedDays) {
    if (day) dateCounts.set(day.date, (dateCounts.get(day.date) ?? 0) + 1)
  }
  const duplicateDates = new Set([...dateCounts].filter(([, count]) => count > 1).map(([date]) => date))
  if (duplicateDates.size > 0) counts.duplicateDates = duplicateDates.size

  for (const day of normalizedDays) {
    if (!day) {
      counts.rejected += 1
      continue
    }
    if (duplicateDates.has(day.date)) {
      counts.rejected += 1
      continue
    }

    counts.accepted += 1
    const fingerprint = JSON.stringify(day)
    if (nextFingerprints[day.date] === fingerprint) {
      counts.unchanged += 1
      continue
    }

    if (Object.hasOwn(nextDays, day.date)) counts.updated += 1
    else counts.added += 1
    nextDays[day.date] = day
    nextFingerprints[day.date] = fingerprint
    changed = true
  }

  const mapsNeedCanonicalization = !hasLexicographicKeys(nextDays) || !hasLexicographicKeys(nextFingerprints)
  if (mapsNeedCanonicalization) changed = true

  return {
    insights: changed ? { ...insights, days: canonicalDateMap(nextDays) } : insights,
    meta: changed ? { ...meta, lastReadAt: updatedAt, dayFingerprints: canonicalDateMap(nextFingerprints) } : meta,
    counts,
    profile: { source: 'Health Connect', updatedAt, changed },
  }
}
