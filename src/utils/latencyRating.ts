/** Relative delay grading, not a measurement of geographical distance or a speed score. */
export const LATENCY_REFERENCE_HOURS = 168
export const LATENCY_REFERENCE_REFRESH_MS = 30 * 60_000
export const LATENCY_BASELINE_MIN_SAMPLES = 30
export const LATENCY_BASELINE_MIN_SPAN_MS = 6 * 60 * 60_000
export const LATENCY_BASELINE_STORAGE_PREFIX = 'komari-theme:latency-baseline:v1:'
export const LATENCY_BASELINE_MAX_AGE_MS = 30 * 24 * 60 * 60_000

export type LatencyRatingMode = 'adaptive' | 'fixed'
export type LatencyRating = 0 | 1 | 2 | 3 | 4
export type LatencyThresholds = readonly [number, number, number, number]

export const LATENCY_TONE_CLASSES = [
  'bg-emerald-500/90',
  'bg-lime-500/90',
  'bg-yellow-400/90',
  'bg-orange-500/90',
  'bg-rose-500/90',
] as const
export const LATENCY_RATING_LABELS = ['优秀', '良好', '一般', '较差', '差'] as const
export const LATENCY_UNKNOWN_CLASS = 'bg-muted-foreground/25'
export const FIXED_LATENCY_THRESHOLDS: LatencyThresholds = [60, 100, 160, 200]

export interface LatencySample {
  time: string
  value: number
}

export interface LatencyBaseline {
  value: number
  sampleCount: number
  observedAt: number
}

export function isValidLatencySample(sample: LatencySample): boolean {
  return Number.isFinite(sample.value) && Number.isFinite(Date.parse(sample.time))
}

export function estimateLatencyBaseline(samples: LatencySample[], now: number): LatencyBaseline | null {
  const earliest = now - LATENCY_REFERENCE_HOURS * 60 * 60_000
  // A failed probe is not a zero-latency observation. Ignore future/malformed records too.
  const successful = samples.filter(sample => isValidLatencySample(sample)
    && sample.value >= 0 && Date.parse(sample.time) >= earliest && Date.parse(sample.time) <= now)
  if (successful.length < LATENCY_BASELINE_MIN_SAMPLES)
    return null

  const timestamps = successful.map(sample => Date.parse(sample.time))
  const first = timestamps.reduce((left, right) => Math.min(left, right), Infinity)
  const last = timestamps.reduce((left, right) => Math.max(left, right), -Infinity)
  if (last - first < LATENCY_BASELINE_MIN_SPAN_MS)
    return null

  const values = successful.map(sample => sample.value).sort((left, right) => left - right)
  // P10 tolerates isolated implausibly fast measurements without following peak-time means.
  const position = (values.length - 1) * 0.1
  const lower = values[Math.floor(position)]!
  const upper = values[Math.ceil(position)]!
  return {
    value: Math.max(1, lower + (upper - lower) * (position - Math.floor(position))),
    sampleCount: successful.length,
    observedAt: last,
  }
}

export function validateCachedLatencyBaseline(value: unknown, now: number): LatencyBaseline | null {
  if (!value || typeof value !== 'object')
    return null
  const baseline = value as Partial<LatencyBaseline>
  if (typeof baseline.value !== 'number' || !Number.isFinite(baseline.value) || baseline.value < 1
    || typeof baseline.sampleCount !== 'number' || !Number.isInteger(baseline.sampleCount)
    || baseline.sampleCount < LATENCY_BASELINE_MIN_SAMPLES
    || typeof baseline.observedAt !== 'number' || !Number.isFinite(baseline.observedAt)
    || baseline.observedAt > now || now - baseline.observedAt > LATENCY_BASELINE_MAX_AGE_MS) {
    return null
  }
  return baseline as LatencyBaseline
}

export function retainLatencyBaseline(
  previous: LatencyBaseline | null,
  candidate: LatencyBaseline | null,
): LatencyBaseline | null {
  if (!previous)
    return candidate
  if (!candidate)
    return previous
  // Do not gradually normalize sustained congestion. A changed route can be relearned explicitly.
  return { ...candidate, value: Math.min(previous.value, candidate.value) }
}

export function getLatencyThresholds(baseline: number): LatencyThresholds {
  return [
    baseline + Math.max(15, baseline * 0.1),
    baseline + Math.max(35, baseline * 0.25),
    baseline + Math.max(65, baseline * 0.5),
    baseline + Math.max(100, baseline),
  ]
}

export function getLatencyRating(
  latency: number,
  mode: LatencyRatingMode,
  baseline: LatencyBaseline | null,
): LatencyRating | null {
  if (!Number.isFinite(latency))
    return null
  if (latency < 0)
    return 4
  if (mode === 'adaptive' && !baseline)
    return null
  const thresholds = mode === 'fixed' ? FIXED_LATENCY_THRESHOLDS : getLatencyThresholds(baseline!.value)
  const level = thresholds.findIndex(threshold => latency <= threshold)
  return level < 0 ? 4 : level as LatencyRating
}

export function describeLatencyRating(mode: LatencyRatingMode, baseline: LatencyBaseline | null): string {
  if (mode === 'adaptive' && !baseline)
    return '路径基线学习中：需要至少 30 次有效检测，且记录覆盖至少 6 小时；真实延迟仍照常显示。'
  const thresholds = mode === 'fixed' ? FIXED_LATENCY_THRESHOLDS : getLatencyThresholds(baseline!.value)
  const levels = thresholds.map((threshold, index) => `${LATENCY_RATING_LABELS[index]} ≤${Math.round(threshold)} ms`)
  const heading = mode === 'fixed'
    ? '固定延迟阈值'
    : `路径正常基线 ${Math.round(baseline!.value)} ms（历史有效记录的 P10 参考值）`
  return `${heading}；${levels.join('，')}，差 >${Math.round(thresholds[3])} ms。${mode === 'adaptive' ? '评级表示相对该路径基线的延迟变化，不用于比较不同地区的绝对速度。' : ''}`
}
