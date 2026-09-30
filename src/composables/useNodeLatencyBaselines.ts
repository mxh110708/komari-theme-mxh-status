import type { MaybeRefOrGetter } from 'vue'
import type { PingRecord, PingTask } from '@/composables/useNodePingStats'
import type { LatencyBaseline } from '@/utils/latencyRating'
import { shallowRef, toValue, watch } from 'vue'
import { estimateLatencyBaseline, LATENCY_BASELINE_STORAGE_PREFIX, retainLatencyBaseline, validateCachedLatencyBaseline } from '@/utils/latencyRating'

const sharedBaselines = new Map<string, LatencyBaseline>()

function readBaseline(key: string, now: number): LatencyBaseline | null {
  const shared = validateCachedLatencyBaseline(sharedBaselines.get(key), now)
  if (shared)
    return shared
  try {
    return validateCachedLatencyBaseline(JSON.parse(window.localStorage.getItem(key) ?? 'null'), now)
  }
  catch {
    return null
  }
}

function saveBaseline(key: string, value: LatencyBaseline): void {
  sharedBaselines.set(key, value)
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
  catch {
    // Privacy mode or full storage must not prevent live grading.
  }
}

export function useNodeLatencyBaselines(
  uuid: MaybeRefOrGetter<string>,
  tasks: MaybeRefOrGetter<PingTask[]>,
  records: MaybeRefOrGetter<PingRecord[]>,
  version: MaybeRefOrGetter<number>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  const baselines = shallowRef(new Map<number, LatencyBaseline>())

  watch(() => [toValue(uuid), toValue(tasks), toValue(records), toValue(version), toValue(enabled)], () => {
    const now = Date.now()
    const next = new Map<number, LatencyBaseline>()
    const nodeUuid = toValue(uuid)
    if (!nodeUuid.trim() || !toValue(enabled)) {
      baselines.value = next
      return
    }

    const recordsByTask = new Map<number, PingRecord[]>()
    for (const record of toValue(records)) {
      if (record.client !== nodeUuid)
        continue
      const grouped = recordsByTask.get(record.task_id) ?? []
      grouped.push(record)
      recordsByTask.set(record.task_id, grouped)
    }

    for (const task of toValue(tasks)) {
      // Do not infer the path from the visitor IP or node flag. Node + task identify the measured path.
      const key = LATENCY_BASELINE_STORAGE_PREFIX + JSON.stringify([toValue(version), nodeUuid, task.id, task.name, task.type ?? ''])
      const previous = readBaseline(key, now)
      const candidate = estimateLatencyBaseline(recordsByTask.get(task.id) ?? [], now)
      const baseline = retainLatencyBaseline(previous, candidate)
      if (!baseline)
        continue
      next.set(task.id, baseline)
      if (!previous || previous.value !== baseline.value || previous.observedAt !== baseline.observedAt
        || previous.sampleCount !== baseline.sampleCount) {
        saveBaseline(key, baseline)
      }
    }
    baselines.value = next
  }, { immediate: true })

  return baselines
}
