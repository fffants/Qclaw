import { useEffect, useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Group, Modal, ScrollArea, Text, Tooltip } from '@mantine/core'
import { IconFolder, IconRefresh } from '@tabler/icons-react'
import type { OpenClawBackupEntry, OpenClawBackupListResult } from '../shared/openclaw-phase3'
import RestoreDialog from './RestoreDialog'

function backupTypeLabel(type: OpenClawBackupEntry['type']): string {
  if (type === 'baseline-backup') return '基线备份'
  if (type === 'manual-backup') return '手动备份'
  if (type === 'config-snapshot') return '配置快照'
  if (type === 'cleanup-backup') return '清理前备份'
  if (type === 'restore-preflight') return '恢复前快照'
  if (type === 'upgrade-preflight') return '升级前快照'
  return '未知类型'
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return iso
  }
}

export default function BackupCenter({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [data, setData] = useState<OpenClawBackupListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [openingDir, setOpeningDir] = useState(false)
  const [runningManualBackup, setRunningManualBackup] = useState(false)
  const [error, setError] = useState('')
  const [selectedBackup, setSelectedBackup] = useState<OpenClawBackupEntry | null>(null)

  const loadBackups = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await window.api.listOpenClawBackups()
      setData(result)
    } catch (e: any) {
      setError(e?.message || '读取备份列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void loadBackups()
  }, [open])

  if (!open) return null

  const openBackupDirectory = async (targetPath?: string) => {
    setOpeningDir(true)
    setError('')
    try {
      const result = await window.api.openOpenClawBackupDirectory(targetPath)
      if (!result.ok) {
        setError(result.error || '打开备份目录失败')
      }
    } finally {
      setOpeningDir(false)
    }
  }

  const runManualBackup = async () => {
    setRunningManualBackup(true)
    setError('')
    try {
      const result = await window.api.runOpenClawManualBackup()
      if (!result.ok || !result.backup) {
        setError(result.message || '立即备份失败')
        return
      }
      await loadBackups()
    } catch (e: any) {
      setError(e?.message || '立即备份失败')
    } finally {
      setRunningManualBackup(false)
    }
  }

  const entries = data?.entries || []
  const backupWarnings = data?.warnings || []
  const showingFallbackRoot = Boolean(
    data?.usedFallbackRoot &&
    data?.preferredRootDirectory &&
    data.preferredRootDirectory !== data.rootDirectory
  )

  return (
    <>
      <Modal opened={open} onClose={onClose} title="备份中心" size="lg" centered>
        {/* 备份目录 + 操作 */}
        <Group justify="space-between" mb="sm">
          <div style={{ minWidth: 0, maxWidth: 400 }}>
            <Text size="xs" c="dimmed" mb={2}>
              {showingFallbackRoot ? 'OpenClaw 当前实际备份目录：' : 'OpenClaw 数据将会备份到这里：'}
            </Text>
            <Tooltip label={data?.rootDirectory || '读取中...'} withArrow multiline maw={400}>
              <Text size="xs" c="dimmed" lineClamp={1} style={{ cursor: 'default' }}>
                {data?.rootDirectory || '读取中...'}
              </Text>
            </Tooltip>
            {showingFallbackRoot && (
              <Text size="xs" c="dimmed" mt={4} lineClamp={1}>
                首选目录：{data?.preferredRootDirectory}
              </Text>
            )}
          </div>
          <Group gap="xs">
            <Button
              variant="light"
              size="compact-xs"
              onClick={() => void runManualBackup()}
              loading={runningManualBackup}
            >
              立即备份
            </Button>
            <Tooltip label="打开备份目录" withArrow>
              <ActionIcon variant="subtle" size="sm" onClick={() => void openBackupDirectory()} loading={openingDir}>
                <IconFolder size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="刷新列表" withArrow>
              <ActionIcon variant="subtle" size="sm" onClick={() => void loadBackups()} loading={loading}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {error && (
          <Alert color="red" variant="light" mb="sm" onClose={() => setError('')} withCloseButton>
            {error}
          </Alert>
        )}

        {!error && backupWarnings.length > 0 && (
          <Alert color="yellow" variant="light" mb="sm">
            {backupWarnings.join(' ')}
          </Alert>
        )}

        {/* 备份列表 */}
        <ScrollArea.Autosize mah={400}>
          {entries.length === 0 && !loading ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              暂无备份记录
            </Text>
          ) : (
            <div className="space-y-1.5">
              {entries.map((entry) => {
                const scopes: string[] = []
                if (entry.scopeAvailability.hasConfigData) scopes.push('配置')
                if (entry.scopeAvailability.hasMemoryData) scopes.push('记忆')
                if (entry.scopeAvailability.hasEnvData && !entry.scopeAvailability.hasConfigData) scopes.push('.env')
                return (
                  <Group
                    key={entry.backupId}
                    justify="space-between"
                    wrap="nowrap"
                    gap="sm"
                    py={6}
                    px="xs"
                    style={{ borderRadius: 'var(--mantine-radius-md)' }}
                    className="transition-colors duration-150"
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--app-bg-tertiary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" fw={500} className="app-text-primary" lineClamp={1}>
                          {backupTypeLabel(entry.type)}
                        </Text>
                        {scopes.map((s) => (
                          <Badge key={s} size="xs" variant="light" color="gray">{s}</Badge>
                        ))}
                      </Group>
                      <Text size="xs" c="dimmed">{formatTime(entry.createdAt)}</Text>
                    </div>
                    <Group gap="xs" wrap="nowrap">
                      <Tooltip label="打开该备份目录" withArrow>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={() => void openBackupDirectory(entry.archivePath)}
                          loading={openingDir}
                        >
                          <IconFolder size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Button
                        variant="light"
                        size="compact-xs"
                        onClick={() => setSelectedBackup(entry)}
                      >
                        恢复
                      </Button>
                    </Group>
                  </Group>
                )
              })}
            </div>
          )}
        </ScrollArea.Autosize>
      </Modal>

      <RestoreDialog
        open={Boolean(selectedBackup)}
        backup={selectedBackup}
        onClose={() => setSelectedBackup(null)}
        onRestored={() => void loadBackups()}
      />
    </>
  )
}
