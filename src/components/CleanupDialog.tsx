import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Loader, Modal, Radio, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type {
  OpenClawCleanupActionType,
  OpenClawCleanupPreviewRequest,
  OpenClawCleanupPreviewResult,
} from '../shared/openclaw-phase3'
import type { OpenClawInstallCandidate } from '../shared/openclaw-phase1'

type CleanupMode = 'remove-openclaw' | 'uninstall-qclaw'

function optionLabel(actionType: OpenClawCleanupActionType): string {
  if (actionType === 'remove-openclaw') return '彻底删除 OpenClaw'
  if (actionType === 'qclaw-uninstall-keep-openclaw') return '仅卸载 Qclaw，保留 OpenClaw'
  return '卸载 Qclaw，同时删除 OpenClaw'
}

export default function CleanupDialog({
  open,
  mode,
  onClose,
}: {
  open: boolean
  mode: CleanupMode
  onClose: () => void
}) {
  const [actionType, setActionType] = useState<OpenClawCleanupActionType>(
    mode === 'remove-openclaw' ? 'remove-openclaw' : 'qclaw-uninstall-keep-openclaw'
  )
  const [backupBeforeDelete, setBackupBeforeDelete] = useState(true)
  const [preview, setPreview] = useState<OpenClawCleanupPreviewResult | null>(null)
  const [running, setRunning] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [availableCandidates, setAvailableCandidates] = useState<OpenClawInstallCandidate[]>([])
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setPreview(null)
    setAvailableCandidates([])
    setSelectedCandidateIds([])
    setActionType(mode === 'remove-openclaw' ? 'remove-openclaw' : 'qclaw-uninstall-keep-openclaw')
    setBackupBeforeDelete(true)
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    let disposed = false
    const loadCandidates = async () => {
      const discovery = await window.api.discoverOpenClaw().catch(() => null)
      if (disposed) return
      const candidates = discovery?.candidates || []
      setAvailableCandidates(candidates)

      const activeCandidateId = String(
        discovery?.activeCandidateId || candidates.find((candidate) => candidate.isPathActive)?.candidateId || candidates[0]?.candidateId || ''
      ).trim()

      if (mode === 'remove-openclaw') {
        setSelectedCandidateIds(activeCandidateId ? [activeCandidateId] : [])
        return
      }

      setSelectedCandidateIds((current) => {
        const validCurrent = current.filter((candidateId) =>
          candidates.some((candidate) => candidate.candidateId === candidateId)
        )
        if (validCurrent.length > 0) return validCurrent
        return activeCandidateId ? [activeCandidateId] : []
      })
    }
    void loadCandidates()
    return () => {
      disposed = true
    }
  }, [open, mode])

  const requiresCandidateSelection = actionType !== 'qclaw-uninstall-keep-openclaw'
  const hasSelectedCandidates = selectedCandidateIds.length > 0

  const previewRequest: OpenClawCleanupPreviewRequest = useMemo(
    () => ({
      actionType,
      backupBeforeDelete,
      selectedCandidateIds: requiresCandidateSelection ? selectedCandidateIds : [],
    }),
    [actionType, backupBeforeDelete, requiresCandidateSelection, selectedCandidateIds]
  )

  useEffect(() => {
    if (!open) return
    let disposed = false
    const loadPreview = async () => {
      const nextPreview =
        mode === 'remove-openclaw'
          ? await window.api.previewOpenClawCleanup(previewRequest)
          : await window.api.previewQClawUninstall(previewRequest)
      if (!disposed) {
        setPreview(nextPreview)
      }
    }
    void loadPreview()
    return () => {
      disposed = true
    }
  }, [open, mode, previewRequest])

  if (!open) return null

  const actionOptions: OpenClawCleanupActionType[] =
    mode === 'remove-openclaw'
      ? ['remove-openclaw']
      : ['qclaw-uninstall-keep-openclaw', 'qclaw-uninstall-remove-openclaw']

  const canBackup = actionType !== 'qclaw-uninstall-keep-openclaw'

  const toggleCandidate = (candidateId: string) => {
    setSelectedCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId]
    )
  }

  const handleSelectAllCandidates = () => {
    setSelectedCandidateIds(availableCandidates.map((candidate) => candidate.candidateId))
  }

  const handleSelectActiveCandidate = () => {
    const activeCandidate = availableCandidates.find((candidate) => candidate.isPathActive) || availableCandidates[0]
    setSelectedCandidateIds(activeCandidate ? [activeCandidate.candidateId] : [])
  }

  const handleClearSelectedCandidates = () => {
    setSelectedCandidateIds([])
  }

  const handleRun = async () => {
    setRunning(true)
    try {
      const nextResult =
        mode === 'remove-openclaw'
          ? await window.api.runOpenClawCleanup(previewRequest)
          : await window.api.prepareQClawUninstall(previewRequest)

      const messageParts: string[] = []
      messageParts.push(nextResult.message || (nextResult.ok ? '执行完成。' : '执行失败。'))
      if (nextResult.ok && nextResult.backupCreated) {
        messageParts.push(`备份路径：${nextResult.backupCreated.archivePath}`)
      }
      if (nextResult.ok && nextResult.summary) {
        const s = nextResult.summary
        messageParts.push(`汇总：总计 ${s.total}，成功 ${s.success}，部分成功 ${s.partial}，失败 ${s.failed}，跳过 ${s.skipped}`)
      }
      if (!nextResult.ok && nextResult.errors.length > 0) {
        messageParts.push(nextResult.errors.join('\n'))
      }
      if (nextResult.manualNextStep) {
        messageParts.push(nextResult.manualNextStep)
      }

      notifications.show({
        title: nextResult.ok ? '执行完成' : '执行失败',
        message: messageParts.join('\n'),
        color: nextResult.ok ? 'brand' : 'red',
        autoClose: false,
      })
      onClose()
    } catch (err) {
      notifications.show({
        title: '执行失败',
        message: err instanceof Error ? err.message : String(err),
        color: 'red',
        autoClose: false,
      })
      onClose()
    } finally {
      setRunning(false)
    }
  }

  const glowHandlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.borderColor = 'var(--app-hover-border)'
      e.currentTarget.style.boxShadow = '0 0 8px var(--app-hover-glow)'
    },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.borderColor = ''
      e.currentTarget.style.boxShadow = ''
    },
  }

  return (
    <div className="fixed inset-0 z-[75] bg-black/70 px-4 py-8 overflow-y-auto">
      <div className="mx-auto max-w-3xl rounded-2xl border app-border app-bg-inset p-6 shadow-2xl my-auto overflow-hidden">
        {running ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader size="lg" color="brand" />
            <Text size="sm" className="app-text-secondary">正在执行，请稍候...</Text>
          </div>
        ) : (
        <>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Text size="xs" className="uppercase tracking-[0.24em] app-text-success/80">
              {mode === 'remove-openclaw' ? 'Cleanup Center' : 'Uninstall Prep'}
            </Text>
            <Title order={3} mt="xs" size="lg" fw={600} className="app-text-primary">
              {mode === 'remove-openclaw' ? '清理 OpenClaw' : '准备卸载 Qclaw'}
            </Title>
          </div>
          <Button variant="subtle" size="xs" onClick={onClose} className="app-text-muted transition hover:app-text-secondary">
            关闭
          </Button>
        </div>

        <div className="mt-5 rounded-xl border app-border app-bg-tertiary p-4">
          <Title order={4} size="sm" fw={500} className="app-text-primary">操作选项</Title>
          <div className="mt-3 grid gap-3">
            {actionOptions.map((option) => (
              <label
                key={option}
                className="rounded-xl border p-4 transition app-border app-bg-inset/60"
                style={
                  actionType === option
                    ? {
                        borderColor: 'var(--app-hover-border)',
                        boxShadow: '0 0 8px var(--app-hover-glow)',
                        backgroundColor: 'var(--app-bg-tertiary)',
                      }
                    : {}
                }
              >
                <div className="flex items-start gap-3">
                  <Radio
                    name="cleanup-action"
                    checked={actionType === option}
                    onChange={() => setActionType(option)}
                    mt={2}
                  />
                  <div>
                    <Text size="sm" fw={500} className="app-text-primary">{optionLabel(option)}</Text>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {requiresCandidateSelection && (
            <div className="mt-4 rounded-xl border app-border app-bg-inset/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <Title order={4} size="sm" fw={500} className="app-text-primary">选择要清理的 OpenClaw 实例</Title>
                <Text size="xs" c="dimmed">
                  已选 {selectedCandidateIds.length} / {availableCandidates.length}
                </Text>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="default" size="xs" onClick={handleSelectAllCandidates} disabled={availableCandidates.length === 0}>
                  全选
                </Button>
                <Button variant="default" size="xs" onClick={handleSelectActiveCandidate} disabled={availableCandidates.length === 0}>
                  仅选当前生效项
                </Button>
                <Button variant="default" size="xs" onClick={handleClearSelectedCandidates} disabled={selectedCandidateIds.length === 0}>
                  清空
                </Button>
              </div>

              <div className="mt-3 space-y-2">
                {availableCandidates.length === 0 ? (
                  <Text size="sm" c="dimmed">当前未检测到可选择的 OpenClaw 实例。</Text>
                ) : (
                  availableCandidates.map((candidate) => (
                    <label
                      key={candidate.candidateId}
                      className="block rounded-lg border app-border app-bg-tertiary/60 p-3"
                      style={
                        selectedCandidateIds.includes(candidate.candidateId)
                          ? {
                              borderColor: 'var(--app-hover-border)',
                              boxShadow: '0 0 8px var(--app-hover-glow)',
                            }
                          : {}
                      }
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedCandidateIds.includes(candidate.candidateId)}
                          onChange={() => toggleCandidate(candidate.candidateId)}
                          mt={2}
                        />
                        <div className="min-w-0">
                          <Text size="sm" fw={500} className="app-text-primary">
                            {candidate.version || '未知版本'} · {candidate.installSource}
                            {candidate.isPathActive ? ' · 当前生效' : ''}
                          </Text>
                          <Text size="xs" mt={2} className="break-all app-text-secondary/90">
                            binary: {candidate.binaryPath}
                          </Text>
                          <Text size="xs" mt={2} className="break-all app-text-secondary/90">
                            state: {candidate.displayStateRoot}
                          </Text>
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {canBackup && (
            <Checkbox
              mt="md"
              label="执行前先备份当前完整状态"
              checked={backupBeforeDelete}
              onChange={(event) => setBackupBeforeDelete(event.currentTarget.checked)}
              size="sm"
            />
          )}
        </div>

        {!preview ? (
          <div className="mt-5 flex items-center gap-3 rounded-xl border app-border app-bg-tertiary p-4 text-sm app-text-secondary">
            <Loader size="xs" color="brand" />
            <span>正在生成 cleanup preview...</span>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div
                className="min-w-0 rounded-xl border app-border app-bg-tertiary p-4"
                style={{ transition: 'border-color 0.2s ease, box-shadow 0.2s ease' }}
                {...glowHandlers}
              >
                <Title order={4} size="sm" fw={500} className="app-text-primary">将删除</Title>
                <div className="mt-3 space-y-2">
                  {preview.deleteItems.length === 0 ? (
                    <Text size="sm" c="dimmed">当前动作不会自动删除 OpenClaw 数据。</Text>
                  ) : (
                    preview.deleteItems.map((item) => (
                      <Text key={item} size="sm" className="leading-6 break-all app-text-secondary">
                        {item}
                      </Text>
                    ))
                  )}
                </div>
              </div>

              <div
                className="min-w-0 rounded-xl border app-border app-bg-tertiary p-4"
                style={{ transition: 'border-color 0.2s ease, box-shadow 0.2s ease' }}
                {...glowHandlers}
              >
                <Title order={4} size="sm" fw={500} className="app-text-primary">将保留</Title>
                <div className="mt-3 space-y-2">
                  {preview.keepItems.map((item) => (
                    <Text key={item} size="sm" className="leading-6 break-all app-text-secondary">
                      {item}
                    </Text>
                  ))}
                </div>
              </div>

              <div
                className="min-w-0 rounded-xl border app-border app-bg-tertiary p-4"
                style={{ transition: 'border-color 0.2s ease, box-shadow 0.2s ease' }}
                {...glowHandlers}
              >
                <Title order={4} size="sm" fw={500} className="app-text-primary">备份计划</Title>
                <div className="mt-3 space-y-2">
                  {preview.backupItems.length === 0 ? (
                    <Text size="sm" c="dimmed">当前未额外创建清理前备份。</Text>
                  ) : (
                    preview.backupItems.map((item) => (
                      <Text key={item} size="sm" className="leading-6 break-all app-text-secondary">
                        {item}
                      </Text>
                    ))
                  )}
                </div>
              </div>
            </div>

            {(preview.warnings.length > 0 || preview.blockedReasons.length > 0) && (
              <div className="mt-5 rounded-xl border app-border app-bg-tertiary p-4">
                {preview.warnings.map((warning) => (
                  <Text key={warning} size="sm" className="leading-6 app-text-warning">
                    {warning}
                  </Text>
                ))}
                {preview.blockedReasons.map((reason) => (
                  <Text key={reason} size="sm" className="leading-6 app-text-warning">
                    {reason}
                  </Text>
                ))}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <Button
                variant="default"
                size="sm"
                onClick={onClose}
              >
                关闭
              </Button>
              <Button
                color="red"
                size="sm"
                onClick={() => setShowConfirm(true)}
                disabled={running || !preview.canRun || (requiresCandidateSelection && !hasSelectedCandidates)}
              >
                {mode === 'remove-openclaw'
                  ? '确认清理 OpenClaw'
                  : '执行卸载准备'}
              </Button>
            </div>

            <Modal
              opened={showConfirm}
              onClose={() => setShowConfirm(false)}
              centered
              size="sm"
              title={
                <Text fw={600} c="red">
                  {mode === 'remove-openclaw' ? '⚠️ 确认清理 OpenClaw' : '⚠️ 确认执行卸载准备'}
                </Text>
              }
            >
              <Text size="sm">
                {mode === 'remove-openclaw'
                  ? '此操作将清理 OpenClaw 相关数据，清理后当前配置将不可恢复。'
                  : '此操作将执行卸载准备，相关数据可能被删除且不可恢复。'}
              </Text>
              <Text size="sm" mt="sm" fw={500} c="brand">
                如需重新使用，可以通过「重新配置」重新进入配置引导完成安装。
              </Text>
              <div className="flex justify-end gap-3 mt-6">
                <Button variant="default" size="sm" onClick={() => setShowConfirm(false)}>
                  取消
                </Button>
                <Button
                  color="red"
                  size="sm"
                  loading={running}
                  onClick={() => {
                    setShowConfirm(false)
                    void handleRun()
                  }}
                >
                  确认执行
                </Button>
              </div>
            </Modal>
          </>
        )}
        </>
        )}
      </div>
    </div>
  )
}
