// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  HEALTH_INSIGHTS_VERSION,
  emptyHealthInsights,
  emptyHealthMeta,
  normalizeHealthDay,
  reconcileHealthDays,
  summarizeHeartRate,
} from './health-insights'

describe('Health Connect daily insight normalization', () => {
  it('normalizes valid steps, distance, and a heart-rate summary', () => {
    expect(normalizeHealthDay({
      date: '2026-10-12',
      steps: 1240,
      distanceM: 1234.5678,
      heartRate: { samples: 3, minBpm: 58.123, maxBpm: 92.987, avgBpm: 71.555 },
    })).toEqual({
      date: '2026-10-12',
      steps: 1240,
      distanceM: 1234.568,
      heartRate: { samples: 3, minBpm: 58.12, maxBpm: 92.99, avgBpm: 71.56 },
    })
  })

  it('summarizes strict local native samples without retaining BPM fields', () => {
    const output = summarizeHeartRate([
      { beatsPerMinute: 62 },
      { beatsPerMinute: 75 },
      { beatsPerMinute: 68 },
    ])

    expect(output).toEqual({ samples: 3, minBpm: 62, maxBpm: 75, avgBpm: 68.33 })
    const serialized = JSON.stringify(output)
    expect(serialized).not.toContain('beatsPerMinute')
  })

  it.each([
    ['a non-enumerable field', samples => {
      Object.defineProperty(samples, 'rawTimestamp', {
        value: '2026-10-12T09:00:00.000Z',
        enumerable: false,
      })
    }],
    ['a symbol field', samples => {
      samples[Symbol('rawRoute')] = []
    }],
  ])('rejects a samples array with %s', (_, decorateSamples) => {
    const samples = [{ beatsPerMinute: 60 }]
    decorateSamples(samples)

    expect(summarizeHeartRate(samples)).toBeNull()
  })

  it.each([
    ['a non-enumerable beatsPerMinute field', sample => {
      Object.defineProperty(sample, 'beatsPerMinute', { value: 60, enumerable: false })
    }],
    ['a symbol field', sample => {
      sample[Symbol('rawTimestamp')] = '2026-10-12T09:00:00.000Z'
    }],
    ['a hidden raw field', sample => {
      Object.defineProperty(sample, 'rawTimestamp', {
        value: '2026-10-12T09:00:00.000Z',
        enumerable: false,
      })
    }],
  ])('rejects a sample with %s', (_, decorateSample) => {
    const sample = { beatsPerMinute: 60 }
    decorateSample(sample)

    expect(summarizeHeartRate([sample])).toBeNull()
  })

  it('rejects malformed dates, negative values, non-finite values, raw samples, and extra metrics', () => {
    expect(normalizeHealthDay({ date: '2026-02-30', steps: 1 })).toBeNull()
    expect(normalizeHealthDay({ date: '2026-10-12', steps: -1 })).toBeNull()
    expect(normalizeHealthDay({ date: '2026-10-12', distanceM: Number.NaN })).toBeNull()
    expect(normalizeHealthDay({ date: '2026-10-12', heartRate: { samples: 1, minBpm: 60, maxBpm: 60, avgBpm: 60, beatsPerMinute: [60] } })).toBeNull()
    expect(normalizeHealthDay({ date: '2026-10-12', route: [{ latitude: 1, longitude: 2 }] })).toBeNull()
  })

  it('rejects date-only and sources-only days without a health metric', () => {
    expect(normalizeHealthDay({ date: '2026-10-12' })).toBeNull()
    expect(normalizeHealthDay({ date: '2026-10-12', sources: ['Watch'] })).toBeNull()
  })

  it('rejects a non-enumerable allowlisted step count', () => {
    const day = { date: '2026-10-12' }
    Object.defineProperty(day, 'steps', { value: 1200, enumerable: false })

    expect(normalizeHealthDay(day)).toBeNull()
  })

  it('normalizes, deduplicates, and orders source labels', () => {
    expect(normalizeHealthDay({
      date: '2026-10-12',
      steps: 10,
      sources: [' Watch ', 'Phone', 'Watch', 'Phone'],
    })).toEqual({ date: '2026-10-12', steps: 10, sources: ['Phone', 'Watch'] })
  })

  it('rejects metrics that overflow or violate the contract after rounding', () => {
    expect(normalizeHealthDay({ date: '2026-10-12', distanceM: Number.MAX_VALUE })).toBeNull()
    expect(normalizeHealthDay({
      date: '2026-10-12',
      heartRate: { samples: 1, minBpm: Number.MAX_VALUE, maxBpm: Number.MAX_VALUE, avgBpm: Number.MAX_VALUE },
    })).toBeNull()
    expect(normalizeHealthDay({
      date: '2026-10-12',
      heartRate: { samples: 1, minBpm: 0.001, maxBpm: 0.001, avgBpm: 0.001 },
    })).toBeNull()
  })

  it('summarizes a large heart-rate sample set without spreading it into call arguments', () => {
    const samples = Array.from({ length: 150_000 }, (_, index) => ({ beatsPerMinute: index % 2 === 0 ? 40 : 200 }))

    expect(summarizeHeartRate(samples)).toEqual({ samples: 150_000, minBpm: 40, maxBpm: 200, avgBpm: 120 })
  })
})

describe('Health Connect daily insight reconciliation', () => {
  it('creates versioned empty containers', () => {
    expect(HEALTH_INSIGHTS_VERSION).toBe(1)
    expect(emptyHealthInsights()).toEqual({ version: 1, days: {}, sessions: {} })
    expect(emptyHealthMeta()).toEqual({
      version: 1,
      disclosureAccepted: false,
      lastReadAt: null,
      importedSessionIds: {},
      dayFingerprints: {},
      permissions: {},
    })
  })

  it('is a no-op when an already reconciled daily payload has the same fingerprint', () => {
    const first = reconcileHealthDays(
      emptyHealthInsights(),
      emptyHealthMeta(),
      [{ date: '2026-10-12', steps: 1200 }],
      '2026-10-12T12:00:00.000Z',
    )
    const second = reconcileHealthDays(
      first.insights,
      first.meta,
      [{ date: '2026-10-12', steps: 1200 }],
      '2026-10-12T12:01:00.000Z',
    )

    expect(second.insights).toBe(first.insights)
    expect(second.meta).toBe(first.meta)
    expect(second.counts).toEqual({ received: 1, accepted: 1, added: 0, updated: 0, unchanged: 1, rejected: 0 })
    expect(second.profile).toEqual({ source: 'Health Connect', updatedAt: '2026-10-12T12:01:00.000Z', changed: false })
  })

  it('canonicalizes valid but unordered stored date maps before returning a no-op', () => {
    const day11 = { date: '2026-10-11', steps: 1100 }
    const day13 = { date: '2026-10-13', steps: 1300 }
    const unorderedInsights = {
      ...emptyHealthInsights(),
      days: { '2026-10-13': day13, '2026-10-11': day11 },
    }
    const unorderedMeta = {
      ...emptyHealthMeta(),
      dayFingerprints: {
        '2026-10-13': JSON.stringify(day13),
        '2026-10-11': JSON.stringify(day11),
      },
    }

    const canonicalized = reconcileHealthDays(
      unorderedInsights,
      unorderedMeta,
      [],
      '2026-10-13T12:00:00.000Z',
    )
    const stable = reconcileHealthDays(
      canonicalized.insights,
      canonicalized.meta,
      [],
      '2026-10-13T12:01:00.000Z',
    )

    expect(canonicalized.profile.changed).toBe(true)
    expect(canonicalized.insights).not.toBe(unorderedInsights)
    expect(canonicalized.meta).not.toBe(unorderedMeta)
    expect(Object.keys(canonicalized.insights.days)).toEqual(['2026-10-11', '2026-10-13'])
    expect(Object.keys(canonicalized.meta.dayFingerprints)).toEqual(['2026-10-11', '2026-10-13'])
    expect(stable.insights).toBe(canonicalized.insights)
    expect(stable.meta).toBe(canonicalized.meta)
  })

  it('produces byte-identical date maps for forward and reverse distinct input batches', () => {
    const day11 = { date: '2026-10-11', steps: 1100 }
    const day12 = { date: '2026-10-12', steps: 1200 }

    const forward = reconcileHealthDays(
      emptyHealthInsights(),
      emptyHealthMeta(),
      [day12, day11],
      '2026-10-12T12:00:00.000Z',
    )
    const reversed = reconcileHealthDays(
      emptyHealthInsights(),
      emptyHealthMeta(),
      [day11, day12],
      '2026-10-12T12:00:00.000Z',
    )

    expect(JSON.stringify(forward.insights)).toBe(JSON.stringify(reversed.insights))
    expect(JSON.stringify(forward.meta)).toBe(JSON.stringify(reversed.meta))
    expect(Object.keys(forward.insights.days)).toEqual(['2026-10-11', '2026-10-12'])
    expect(Object.keys(forward.meta.dayFingerprints)).toEqual(['2026-10-11', '2026-10-12'])
  })

  it('rejects noncanonical stored days even when their fingerprint matches the incoming canonical day', () => {
    const canonicalDay = { date: '2026-10-12', distanceM: 1.235 }
    const insightsWithNoncanonicalDay = {
      ...emptyHealthInsights(),
      days: {
        '2026-10-12': { date: '2026-10-12', distanceM: 1.23456 },
      },
    }
    const metaWithCanonicalFingerprint = {
      ...emptyHealthMeta(),
      dayFingerprints: { '2026-10-12': JSON.stringify(canonicalDay) },
    }

    expect(() => reconcileHealthDays(
      insightsWithNoncanonicalDay,
      metaWithCanonicalFingerprint,
      [canonicalDay],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it('rejects a stored day whose property order is not byte-canonical', () => {
    const day = { steps: 1200, date: '2026-10-12' }
    const insights = { ...emptyHealthInsights(), days: { '2026-10-12': day } }
    const meta = {
      ...emptyHealthMeta(),
      dayFingerprints: { '2026-10-12': JSON.stringify(day) },
    }

    expect(() => reconcileHealthDays(
      insights,
      meta,
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it('rejects stored days containing raw timestamp or route data before a no-op can return them', () => {
    const insightsWithRawData = {
      ...emptyHealthInsights(),
      days: {
        '2026-10-12': {
          date: '2026-10-12',
          steps: 1200,
          timestamp: '2026-10-12T09:00:00.000Z',
          route: [{ latitude: 51.5, longitude: -0.12 }],
        },
      },
    }

    expect(() => reconcileHealthDays(
      insightsWithRawData,
      emptyHealthMeta(),
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it.each([
    ['a non-enumerable source field', sources => {
      Object.defineProperty(sources, 'rawTimestamp', {
        value: '2026-10-12T09:00:00.000Z',
        enumerable: false,
      })
    }],
    ['a symbol source field', sources => {
      sources[Symbol('rawRoute')] = [{ latitude: 51.5, longitude: -0.12 }]
    }],
  ])('rejects a stored source array with %s before a no-op can return it', (_, mutateSources) => {
    const day = { date: '2026-10-12', steps: 1200, sources: ['Watch'] }
    mutateSources(day.sources)
    const insights = { ...emptyHealthInsights(), days: { '2026-10-12': day } }
    const meta = {
      ...emptyHealthMeta(),
      dayFingerprints: { '2026-10-12': JSON.stringify({ date: '2026-10-12', steps: 1200, sources: ['Watch'] }) },
    }

    expect(() => reconcileHealthDays(
      insights,
      meta,
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it.each([
    ['a non-enumerable raw timestamp', days => {
      Object.defineProperty(days, 'rawTimestamp', {
        value: '2026-10-12T09:00:00.000Z',
        enumerable: false,
      })
    }],
    ['a symbol raw route', days => {
      days[Symbol('rawRoute')] = [{ latitude: 51.5, longitude: -0.12 }]
    }],
  ])('rejects a stored days map with %s before a no-op can return it', (_, addRawData) => {
    const days = { '2026-10-12': { date: '2026-10-12', steps: 1200 } }
    addRawData(days)

    expect(() => reconcileHealthDays(
      { ...emptyHealthInsights(), days },
      emptyHealthMeta(),
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it.each([
    ['a non-enumerable field', days => {
      Object.defineProperty(days, 'rawTimestamp', {
        value: '2026-10-12T09:00:00.000Z',
        enumerable: false,
      })
    }],
    ['a symbol field', days => {
      days[Symbol('rawRoute')] = []
    }],
  ])('rejects an incoming days array with %s', (_, decorateDays) => {
    const days = [{ date: '2026-10-12', steps: 1200 }]
    decorateDays(days)

    expect(() => reconcileHealthDays(
      emptyHealthInsights(),
      emptyHealthMeta(),
      days,
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it('rejects unexpected top-level raw fields before a no-op can return them', () => {
    const insightsWithRawTopLevelData = {
      ...emptyHealthInsights(),
      rawRoute: [{ latitude: 51.5, longitude: -0.12 }],
      rawSamples: [{ timestamp: '2026-10-12T09:00:00.000Z', beatsPerMinute: 62 }],
      timestamp: '2026-10-12T09:00:00.000Z',
    }

    expect(() => reconcileHealthDays(
      insightsWithRawTopLevelData,
      emptyHealthMeta(),
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it('rejects non-enumerable unexpected top-level fields', () => {
    const insightsWithHiddenTimestamp = emptyHealthInsights()
    Object.defineProperty(insightsWithHiddenTimestamp, 'timestamp', {
      value: '2026-10-12T09:00:00.000Z',
      enumerable: false,
    })

    expect(() => reconcileHealthDays(
      insightsWithHiddenTimestamp,
      emptyHealthMeta(),
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it.each([
    ['a non-enumerable raw timestamp', meta => {
      Object.defineProperty(meta, 'rawTimestamp', {
        value: '2026-10-12T09:00:00.000Z',
        enumerable: false,
      })
    }],
    ['a symbol raw route', meta => {
      meta[Symbol('rawRoute')] = [{ latitude: 51.5, longitude: -0.12 }]
    }],
    ['a persisted imported session id', meta => {
      meta.importedSessionIds.session1 = true
    }],
    ['a persisted permission', meta => {
      meta.permissions.healthConnect = 'granted'
    }],
  ])('rejects metadata with %s before a no-op can return it', (_, mutateMeta) => {
    const meta = emptyHealthMeta()
    mutateMeta(meta)

    expect(() => reconcileHealthDays(
      emptyHealthInsights(),
      meta,
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it.each([
    ['a non-date fingerprint key', meta => {
      meta.dayFingerprints.invalid = 'fingerprint'
    }],
    ['a non-enumerable fingerprint key', meta => {
      Object.defineProperty(meta.dayFingerprints, '2026-10-12', {
        value: 'fingerprint',
        enumerable: false,
      })
    }],
    ['a symbol fingerprint key', meta => {
      meta.dayFingerprints[Symbol('fingerprint')] = 'fingerprint'
    }],
    ['a non-string fingerprint value', meta => {
      meta.dayFingerprints['2026-10-12'] = 1
    }],
  ])('rejects metadata with %s before a no-op can return it', (_, mutateMeta) => {
    const meta = emptyHealthMeta()
    mutateMeta(meta)

    expect(() => reconcileHealthDays(
      emptyHealthInsights(),
      meta,
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it('rejects fingerprint dates that do not exactly match stored insight dates', () => {
    const insightDay = { date: '2026-10-12', steps: 1200 }
    const insights = {
      ...emptyHealthInsights(),
      days: { '2026-10-12': insightDay },
    }
    const meta = {
      ...emptyHealthMeta(),
      dayFingerprints: { '2026-10-11': JSON.stringify(insightDay) },
    }

    expect(() => reconcileHealthDays(
      insights,
      meta,
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it('rejects a stale fingerprint before an incoming changed day can become a false no-op', () => {
    const storedDay = { date: '2026-10-12', steps: 1200 }
    const incomingDay = { date: '2026-10-12', steps: 1300 }
    const insights = {
      ...emptyHealthInsights(),
      days: { '2026-10-12': storedDay },
    }
    const meta = {
      ...emptyHealthMeta(),
      dayFingerprints: { '2026-10-12': JSON.stringify(incomingDay) },
    }

    expect(() => reconcileHealthDays(
      insights,
      meta,
      [incomingDay],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it.each([
    ['a hidden imported session id', meta => {
      Object.defineProperty(meta.importedSessionIds, 'session1', {
        value: true,
        enumerable: false,
      })
    }],
    ['a symbol permission', meta => {
      meta.permissions[Symbol('healthConnect')] = 'granted'
    }],
  ])('rejects metadata with %s before a no-op can return it', (_, mutateMeta) => {
    const meta = emptyHealthMeta()
    mutateMeta(meta)

    expect(() => reconcileHealthDays(
      emptyHealthInsights(),
      meta,
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it('rejects every duplicate-date input in a batch regardless of input order', () => {
    const base = reconcileHealthDays(
      emptyHealthInsights(),
      emptyHealthMeta(),
      [{ date: '2026-10-11', steps: 100 }],
      '2026-10-12T11:00:00.000Z',
    )
    const first = { date: '2026-10-12', steps: 1200 }
    const second = { date: '2026-10-12', steps: 1300 }
    const expectedCounts = { received: 2, accepted: 0, added: 0, updated: 0, unchanged: 0, rejected: 2, duplicateDates: 1 }

    const forward = reconcileHealthDays(base.insights, base.meta, [first, second], '2026-10-12T12:00:00.000Z')
    const reversed = reconcileHealthDays(base.insights, base.meta, [second, first], '2026-10-12T12:00:00.000Z')

    expect(forward.insights).toBe(base.insights)
    expect(reversed.insights).toBe(base.insights)
    expect(forward.meta).toBe(base.meta)
    expect(reversed.meta).toBe(base.meta)
    expect(forward.counts).toEqual(expectedCounts)
    expect(reversed.counts).toEqual(expectedCounts)
  })

  it('rejects pre-existing session contents, including raw timestamp and route data', () => {
    const insightsWithSessions = {
      ...emptyHealthInsights(),
      sessions: {
        session1: {
          startedAt: '2026-10-12T09:00:00.000Z',
          route: [{ latitude: 51.5, longitude: -0.12 }],
        },
      },
    }

    expect(() => reconcileHealthDays(
      insightsWithSessions,
      emptyHealthMeta(),
      [],
      '2026-10-12T12:00:00.000Z',
    )).toThrow(TypeError)
  })

  it('updates a changed day and returns a Health Connect profile projection', () => {
    const first = reconcileHealthDays(
      emptyHealthInsights(),
      emptyHealthMeta(),
      [{ date: '2026-10-12', steps: 1200 }],
      '2026-10-12T12:00:00.000Z',
    )
    const second = reconcileHealthDays(
      first.insights,
      first.meta,
      [{ date: '2026-10-12', steps: 1300 }],
      new Date('2026-10-12T12:01:00.000Z'),
    )

    expect(second.insights.days['2026-10-12']).toEqual({ date: '2026-10-12', steps: 1300 })
    expect(second.meta.dayFingerprints['2026-10-12']).not.toBe(first.meta.dayFingerprints['2026-10-12'])
    expect(second.counts).toEqual({ received: 1, accepted: 1, added: 0, updated: 1, unchanged: 0, rejected: 0 })
    expect(second.profile).toEqual({ source: 'Health Connect', updatedAt: '2026-10-12T12:01:00.000Z', changed: true })
  })

  it('accepts and reconciles a steps-only day', () => {
    const output = reconcileHealthDays(
      emptyHealthInsights(),
      emptyHealthMeta(),
      [{ date: '2026-10-12', steps: 42 }],
      '2026-10-12T12:00:00.000Z',
    )

    expect(output.insights.days).toEqual({ '2026-10-12': { date: '2026-10-12', steps: 42 } })
    expect(output.counts).toEqual({ received: 1, accepted: 1, added: 1, updated: 0, unchanged: 0, rejected: 0 })
  })
})
