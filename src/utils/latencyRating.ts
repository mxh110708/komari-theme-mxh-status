import { getCountryCodeFromRegion } from '@/utils/geoHelper'

export type LatencyRatingMode = 'geographic' | 'fixed'
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

export interface LatencyLocation {
  label: string
  latitude: number
  longitude: number
}

export interface LatencyLocationRule extends LatencyLocation {
  match: string
}

export interface GeographicLatencyPath {
  node: LatencyLocation
  target: LatencyLocation
  distanceKm: number
  minimumRttMs: number
  thresholds: LatencyThresholds
}

interface NamedLocation extends LatencyLocation {
  country: string
  matcher: RegExp
}

// City reference points, not country centroids or visitor IP geolocation.
// Sources: Wikidata Q16572, Q65, Q16553 and Q1794; precision is regional, not rack-level.
const NAMED_LOCATIONS: NamedLocation[] = [
  { label: '洛杉矶', latitude: 34.05, longitude: -118.25, country: 'US', matcher: /洛杉矶|los[\s_-]*angeles|(?:^|[^a-z])(?:lax|la)(?:[^a-z]|$)/i },
  { label: '圣何塞', latitude: 37.3361, longitude: -121.8906, country: 'US', matcher: /圣何塞|san[\s_-]*jose|(?:^|[^a-z])sjc(?:[^a-z]|$)/i },
  { label: '法兰克福', latitude: 50.1106, longitude: 8.6822, country: 'DE', matcher: /法兰克福|frankfurt|(?:^|[^a-z])fra(?:[^a-z]|$)/i },
  { label: '广东（广州参考点）', latitude: 23.13, longitude: 113.26, country: 'CN', matcher: /广东|广州|guangdong|guangzhou|(?:^|[^a-z])gd(?:[^a-z]|$)/i },
]

export function isValidLatencyLocation(value: unknown): value is LatencyLocation {
  if (!value || typeof value !== 'object')
    return false
  const point = value as Partial<LatencyLocation>
  return typeof point.label === 'string' && !!point.label.trim() && point.label.length <= 100
    && typeof point.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
}

/** null means invalid configuration: do not silently substitute a guessed location. */
export function parseLatencyLocationRules(value: unknown): LatencyLocationRule[] | null {
  if (value === undefined || value === null || value === '')
    return []
  if (typeof value !== 'string')
    return null
  if (!value.trim())
    return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length > 200)
      return null
    if (!parsed.every(rule => isValidLatencyLocation(rule)
      && 'match' in rule && typeof rule.match === 'string' && !!rule.match.trim() && rule.match.length <= 200)) {
      return null
    }
    return parsed.map(rule => ({
      match: rule.match.trim(),
      label: rule.label.trim(),
      latitude: rule.latitude,
      longitude: rule.longitude,
    }))
  }
  catch {
    return null
  }
}

export function resolveLatencyLocation(
  name: string,
  rules: LatencyLocationRule[] | null = [],
  region?: string,
): LatencyLocation | null {
  if (!name.trim() || rules === null)
    return null
  const normalizedName = name.toLowerCase()
  const overrides = rules.filter(rule => normalizedName.includes(rule.match.toLowerCase()))
  // Conflicting matches must be corrected by the administrator, never resolved by list order.
  const candidates: LatencyLocation[] = overrides.length ? overrides : NAMED_LOCATIONS.filter(point => point.matcher.test(name))
  if (!overrides.length) {
    const country = getCountryCodeFromRegion(region)
    if (country && candidates.some(point => (point as NamedLocation).country !== country))
      return null
  }
  const unique = new Map(candidates.map(point => [`${point.latitude},${point.longitude}`, point]))
  return unique.size === 1 ? [...unique.values()][0]! : null
}

export function getGeographicDistanceKm(left: LatencyLocation, right: LatencyLocation): number | null {
  if (!isValidLatencyLocation(left) || !isValidLatencyLocation(right))
    return null
  const radians = Math.PI / 180
  const latitude = (right.latitude - left.latitude) * radians
  const longitude = (right.longitude - left.longitude) * radians
  const haversine = Math.sin(latitude / 2) ** 2
    + Math.cos(left.latitude * radians) * Math.cos(right.latitude * radians) * Math.sin(longitude / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))))
}

export function getGeographicLatencyPath(
  node: LatencyLocation | null,
  target: LatencyLocation | null,
): GeographicLatencyPath | null {
  if (!node || !target)
    return null
  const distanceKm = getGeographicDistanceKm(node, target)
  if (distanceKm === null)
    return null
  // Approximate fibre propagation: 200 km/ms, round trip. This is a physical lower
  // bound, NOT a prediction of the actual cable route or a one-way delay value.
  const minimumRttMs = distanceKm / 100
  // One universal display policy. No measured RTT, carrier, ASN or node history
  // enters these limits, so a stable detour cannot teach itself a better grade.
  const thresholds: LatencyThresholds = [
    Math.round(minimumRttMs * 1.5 + 15),
    Math.round(minimumRttMs * 1.8 + 25),
    Math.round(minimumRttMs * 2.2 + 35),
    Math.round(minimumRttMs * 2.8 + 45),
  ]
  return { node, target, distanceKm, minimumRttMs, thresholds }
}

export function isValidLatencySample(sample: { time: string, value: number }): boolean {
  return Number.isFinite(sample.value) && Number.isFinite(Date.parse(sample.time))
}

export function getLatencyRating(
  latency: number,
  mode: LatencyRatingMode,
  path: GeographicLatencyPath | null,
): LatencyRating | null {
  if (!Number.isFinite(latency))
    return null
  if (latency < 0)
    return 4
  if (mode === 'geographic' && !path)
    return null
  const thresholds = mode === 'fixed' ? FIXED_LATENCY_THRESHOLDS : path!.thresholds
  const level = thresholds.findIndex(threshold => latency <= threshold)
  return level < 0 ? 4 : level as LatencyRating
}

export function describeLatencyRating(mode: LatencyRatingMode, path: GeographicLatencyPath | null): string {
  if (mode === 'geographic' && !path)
    return '地理位置待配置：无法确定机房或检测目标位置。可在主题管理中补充坐标；真实延迟与检测失败仍正常显示。'
  const thresholds = mode === 'fixed' ? FIXED_LATENCY_THRESHOLDS : path!.thresholds
  const levels = thresholds.map((threshold, index) => `${LATENCY_RATING_LABELS[index]} ≤${threshold} ms`)
  const heading = mode === 'fixed'
    ? '固定延迟阈值'
    : `${path!.node.label} ↔ ${path!.target.label}；地理距离约 ${Math.round(path!.distanceKm)} km，光纤传播 RTT 下限约 ${Math.round(path!.minimumRttMs)} ms`
  return `${heading}；${levels.join('，')}，差 >${thresholds[3]} ms。${mode === 'geographic' ? '采用统一距离公式及固定余量，不根据线路历史放宽。坐标为地区参考点；评级是主题展示标准，不是实际光缆路径测量。' : ''}`
}
