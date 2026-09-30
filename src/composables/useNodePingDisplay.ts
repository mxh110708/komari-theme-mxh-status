import type { MaybeRefOrGetter } from 'vue'
import type { PingRecord, PingTask } from '@/composables/useNodePingStats'
import type { GeographicLatencyPath, LatencyRating, LatencyRatingMode } from '@/utils/latencyRating'
import { computed, toValue } from 'vue'
import { useNodePingStats } from '@/composables/useNodePingStats'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatDateTime } from '@/utils/helper'
import { describeLatencyRating, getGeographicLatencyPath, getLatencyRating, isValidLatencySample, LATENCY_RATING_LABELS, LATENCY_TONE_CLASSES, LATENCY_UNKNOWN_CLASS, resolveLatencyLocation } from '@/utils/latencyRating'

export type NodePingMetric = 'latency' | 'loss'
export type NetworkProtocol = 'ipv4' | 'ipv6'
export type NetworkCarrier = 'mobile' | 'unicom' | 'telecom'

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

export interface NodeNetworkQualityRow {
  carrier: NetworkCarrier
  label: string
  dotClass: string
  taskName: string | null
  latency: number | null
  loss: number | null
  latencyDisplay: string
  latencyDescription: string
  locationReady: boolean
  lossDisplay: string
  latencyBars: NodePingBar[]
  lossBars: NodePingBar[]
  hasData: boolean
}

interface UseNodePingDisplayOptions {
  historyHours?: number
}

const HISTORY_SAMPLE_COUNT = 20
const IPV6_TASK_PATTERN = /ipv6|\bv6\b/i

const CARRIERS: Array<{
  carrier: NetworkCarrier
  label: string
  dotClass: string
  matcher: RegExp
}> = [
  { carrier: 'mobile', label: '移动', dotClass: 'bg-pink-500', matcher: /mobile|cmcc|移动/i },
  { carrier: 'unicom', label: '联通', dotClass: 'bg-blue-500', matcher: /unicom|联通/i },
  { carrier: 'telecom', label: '电信', dotClass: 'bg-emerald-500', matcher: /telecom|电信/i },
]

function getLatencyToneClass(rating: LatencyRating | null): string {
  return rating === null ? LATENCY_UNKNOWN_CLASS : LATENCY_TONE_CLASSES[rating]
}

function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-emerald-500/90'
  if (loss <= 3)
    return 'bg-lime-500/90'
  if (loss <= 6)
    return 'bg-yellow-400/90'
  if (loss <= 9)
    return 'bg-orange-500/90'
  return 'bg-rose-500/90'
}

function average(values: number[]): number | null {
  if (!values.length)
    return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getTaskProtocol(task: PingTask): NetworkProtocol {
  return IPV6_TASK_PATTERN.test(task.name) ? 'ipv6' : 'ipv4'
}

function buildEmptyBars(metric: NodePingMetric, count: number): NodePingBar[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `${metric}-empty-${index}`,
    className: 'bg-muted-foreground/15',
    tooltip: '暂无检测数据',
  }))
}

function buildMetricBars(
  records: PingRecord[],
  metric: NodePingMetric,
  mode: LatencyRatingMode,
  path: GeographicLatencyPath | Map<number, GeographicLatencyPath> | null,
): NodePingBar[] {
  const samples = records
    .map(record => ({ ...record, timestamp: new Date(record.time).getTime() }))
    .filter(record => Number.isFinite(record.timestamp) && Number.isFinite(record.value))
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-HISTORY_SAMPLE_COUNT)

  const missingCount = Math.max(0, HISTORY_SAMPLE_COUNT - samples.length)
  const bars = samples.map((record, index): NodePingBar => {
    const failed = record.value < 0
    const value = metric === 'latency' ? record.value : failed ? 100 : 0
    const formattedTime = formatDateTime(record.time, 'HH:mm:ss')
    const recordPath = path instanceof Map ? path.get(record.task_id) ?? null : path
    const rating = getLatencyRating(value, mode, recordPath)

    return {
      key: `${metric}-${record.time}-${record.task_id}-${index}`,
      className: failed
        ? 'bg-rose-500/90'
        : metric === 'latency'
          ? getLatencyToneClass(rating)
          : getLossToneClass(value),
      tooltip: failed
        ? `${formattedTime} 检测失败`
        : metric === 'latency'
          ? `${formattedTime} ${Math.round(value)} ms · ${rating === null ? '地理位置待配置' : LATENCY_RATING_LABELS[rating]}\n${describeLatencyRating(mode, recordPath)}`
          : `${formattedTime} 0.0%`,
    }
  })

  return [...buildEmptyBars(metric, missingCount), ...bars]
}

function buildRow(
  carrierConfig: typeof CARRIERS[number],
  protocol: NetworkProtocol,
  tasks: PingTask[],
  records: PingRecord[],
  mode: LatencyRatingMode,
  paths: Map<number, GeographicLatencyPath>,
): NodeNetworkQualityRow {
  const task = tasks.find(item => getTaskProtocol(item) === protocol && carrierConfig.matcher.test(item.name))
  const taskRecords = task ? records.filter(record => record.task_id === task.id && isValidLatencySample(record)) : []
  const path = task ? paths.get(task.id) ?? null : null
  const successfulValues = taskRecords.filter(record => record.value >= 0).map(record => record.value)
  const latency = average(successfulValues)
  const loss = taskRecords.length
    ? (taskRecords.length - successfulValues.length) / taskRecords.length * 100
    : null

  return {
    carrier: carrierConfig.carrier,
    label: carrierConfig.label,
    dotClass: carrierConfig.dotClass,
    taskName: task?.name ?? null,
    latency,
    loss,
    latencyDisplay: latency === null ? '—' : `${Math.round(latency)} ms`,
    latencyDescription: describeLatencyRating(mode, path),
    locationReady: path !== null,
    lossDisplay: loss === null ? '—' : `${loss.toFixed(1)}%`,
    latencyBars: buildMetricBars(taskRecords, 'latency', mode, path),
    lossBars: buildMetricBars(taskRecords, 'loss', mode, path),
    hasData: taskRecords.length > 0,
  }
}

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  protocol: MaybeRefOrGetter<NetworkProtocol> = 'ipv4',
  options: UseNodePingDisplayOptions = {},
) {
  const appStore = useAppStore()
  const nodesStore = useNodesStore()

  const pingStatsEnabled = computed(() => appStore.publicSettings?.record_enabled !== false
    && appStore.publicSettings?.ping_record_preserve_time !== 0)

  const pingStatsHours = computed(() => {
    const preserveTime = appStore.publicSettings?.ping_record_preserve_time
    const requestedHours = options.historyHours ?? 1
    if (typeof preserveTime === 'number' && preserveTime > 0)
      return Math.min(preserveTime, requestedHours)
    return requestedHours
  })

  const pingStats = useNodePingStats(uuid, {
    hours: pingStatsHours,
    enabled: pingStatsEnabled,
  })

  // Task IDs only select geographical endpoints, never independent rating standards.
  const geographicPaths = computed(() => {
    const paths = new Map<number, GeographicLatencyPath>()
    const node = nodesStore.nodesByUuid.get(toValue(uuid))
    if (!node || appStore.networkLatencyRatingMode !== 'geographic')
      return paths
    const location = resolveLatencyLocation(node.name, appStore.networkLatencyNodeLocations, node.region)
    for (const task of pingStats.tasks.value) {
      const target = resolveLatencyLocation(task.name, appStore.networkLatencyTaskLocations)
      const path = getGeographicLatencyPath(location, target)
      if (path)
        paths.set(task.id, path)
    }
    return paths
  })

  const qualityRows = computed(() => CARRIERS.map(carrier => buildRow(
    carrier,
    toValue(protocol),
    pingStats.tasks.value,
    pingStats.records.value,
    appStore.networkLatencyRatingMode,
    geographicPaths.value,
  )))

  // IP 字段在访客模式下可能被 Komari 隐藏，因此同时从真实记录反推协议能力。
  // 同一协议即使对应多个地址或任务，也只生成一个协议标签。
  const detectedProtocols = computed<NetworkProtocol[]>(() => {
    const taskProtocols = new Map(
      pingStats.tasks.value.map(task => [task.id, getTaskProtocol(task)]),
    )
    const protocols = new Set<NetworkProtocol>()

    for (const record of pingStats.records.value) {
      const taskProtocol = taskProtocols.get(record.task_id)
      if (taskProtocol)
        protocols.add(taskProtocol)
    }

    return (['ipv4', 'ipv6'] as const).filter(protocol => protocols.has(protocol))
  })

  const hasSelectedProtocolData = computed(() => qualityRows.value.some(row => row.hasData))

  const networkQualityDescription = computed(() => [
    '每格表示近期一次真实检测，延迟数值不作换算。检测失败率不因路径距离而调整。',
    ...qualityRows.value.filter(row => row.hasData).map(row => `${row.label}：${row.latencyDescription}`),
  ].join('\n'))
  const latencyRatingNote = computed(() => {
    if (appStore.networkLatencyRatingMode === 'fixed')
      return '使用固定延迟阈值'
    const activeRows = qualityRows.value.filter(row => row.hasData)
    return !activeRows.length || activeRows.some(row => !row.locationReady)
      ? '地理位置待配置'
      : '按地理距离评级'
  })

  // 列表保留汇总数值；不同地理路径先分别按同一公式评级，再取最差等级。
  const latencyRenderBars = computed(() => {
    const points = pingStats.history.value.slice(-HISTORY_SAMPLE_COUNT)
    if (!points.length)
      return buildMetricBars(pingStats.records.value, 'latency', appStore.networkLatencyRatingMode, geographicPaths.value)
    const bars = points.map((point, index): NodePingBar => {
      const start = Date.parse(point.time)
      const end = index + 1 < points.length ? Date.parse(points[index + 1]!.time) : Infinity
      const ratings = pingStats.records.value
        .filter(record => isValidLatencySample(record) && Date.parse(record.time) >= start && Date.parse(record.time) < end)
        .map(record => getLatencyRating(record.value, appStore.networkLatencyRatingMode, geographicPaths.value.get(record.task_id) ?? null))
      const rating: LatencyRating | null = point.latency === null || ratings.includes(4) ? 4 : !ratings.length || ratings.includes(null) ? null : Math.max(...ratings as LatencyRating[]) as LatencyRating
      return {
        key: `latency-${point.time}-${index}`,
        className: getLatencyToneClass(rating),
        tooltip: point.latency === null
          ? `${formatDateTime(point.time, 'HH:mm:ss')} 检测失败`
          : `${formatDateTime(point.time, 'HH:mm:ss')} ${Math.round(point.latency)} ms · ${rating === null ? '地理位置待配置' : LATENCY_RATING_LABELS[rating]}\n汇总颜色表示各地理路径按统一距离公式评级后的最差结果。`,
      }
    })
    return [...buildEmptyBars('latency', HISTORY_SAMPLE_COUNT - bars.length), ...bars]
  })

  const lossRenderBars = computed(() => {
    const points = pingStats.history.value.slice(-HISTORY_SAMPLE_COUNT)
    if (!points.length)
      return buildMetricBars(pingStats.records.value, 'loss', appStore.networkLatencyRatingMode, geographicPaths.value)
    const bars = points.map((point, index): NodePingBar => ({
      key: `loss-${point.time}-${index}`,
      className: point.loss === null ? 'bg-muted-foreground/15' : getLossToneClass(point.loss),
      tooltip: point.loss === null
        ? `${formatDateTime(point.time, 'HH:mm:ss')} N/A`
        : `${formatDateTime(point.time, 'HH:mm:ss')} ${point.loss.toFixed(1)}%`,
    }))
    return [...buildEmptyBars('loss', HISTORY_SAMPLE_COUNT - bars.length), ...bars]
  })

  return {
    pingStats,
    pingStatsEnabled,
    pingStatsHours,
    qualityRows,
    detectedProtocols,
    hasSelectedProtocolData,
    networkQualityDescription,
    latencyRatingNote,
    latencyRenderBars,
    lossRenderBars,
  }
}
