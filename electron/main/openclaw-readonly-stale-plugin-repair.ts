import {
  repairStalePluginConfigFromCommandResult,
  type RepairStalePluginConfigFromCommandResult,
} from './openclaw-config-warnings'

export interface ReadOnlyStalePluginRepairableResult {
  stdout?: string
  stderr?: string
}

interface RetryReadOnlyCommandAfterStalePluginRepairOptions {
  repairStalePluginConfigFromCommandResult?: (
    result: ReadOnlyStalePluginRepairableResult
  ) => Promise<RepairStalePluginConfigFromCommandResult>
}

export async function rerunReadOnlyCommandAfterStalePluginRepair<T extends ReadOnlyStalePluginRepairableResult>(
  runCommand: () => Promise<T>,
  options: RetryReadOnlyCommandAfterStalePluginRepairOptions = {}
): Promise<T> {
  const initialResult = await runCommand()
  const repair = options.repairStalePluginConfigFromCommandResult || repairStalePluginConfigFromCommandResult

  let repairResult: RepairStalePluginConfigFromCommandResult
  try {
    repairResult = await repair(initialResult)
  } catch {
    return initialResult
  }

  const changed = repairResult?.changed === true
  const removedPluginIds = Array.isArray(repairResult?.removedPluginIds)
    ? repairResult.removedPluginIds
    : []

  if (!changed || removedPluginIds.length === 0) {
    return initialResult
  }

  try {
    return await runCommand()
  } catch {
    return initialResult
  }
}
