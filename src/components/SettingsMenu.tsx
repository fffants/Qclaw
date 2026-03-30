import { useEffect, useState } from 'react'
import { ActionIcon, Button } from '@mantine/core'
import BackupCenter from './BackupCenter'
import CleanupDialog from './CleanupDialog'
import OpenClawDataCleanupDialog from './OpenClawDataCleanupDialog'
import UpdateCenter from './UpdateCenter'

export default function SettingsMenu({
  updateCenterOpen = false,
  onUpdateCenterOpenChange,
}: {
  updateCenterOpen?: boolean
  onUpdateCenterOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [showUpdateCenter, setShowUpdateCenter] = useState(false)
  const [showBackupCenter, setShowBackupCenter] = useState(false)
  const [showCleanupDialog, setShowCleanupDialog] = useState(false)
  const [showDataCleanupDialog, setShowDataCleanupDialog] = useState(false)

  useEffect(() => {
    if (updateCenterOpen) {
      setShowUpdateCenter(true)
    }
  }, [updateCenterOpen])

  const setUpdateCenterVisibility = (value: boolean) => {
    setShowUpdateCenter(value)
    onUpdateCenterOpenChange?.(value)
  }

  return (
    <>
      <div className="fixed right-3 bottom-3 z-30" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <ActionIcon
          onClick={() => setOpen((value) => !value)}
          variant="filled"
          size="lg"
          radius="md"
          className="app-bg-tertiary app-text-muted transition-colors hover:app-bg-tertiary/90 hover:app-text-secondary"
          title="设置"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </ActionIcon>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 bottom-10 z-50 min-w-[200px] overflow-hidden rounded-xl border app-border app-bg-tertiary shadow-2xl">
              <Button
                onClick={() => {
                  setUpdateCenterVisibility(true)
                  setOpen(false)
                }}
                variant="subtle"
                fullWidth
                size="sm"
                justify="flex-start"
                className="px-4 py-3 app-text-secondary transition hover:app-bg-tertiary"
              >
                升级中心
              </Button>
              <Button
                onClick={() => {
                  setShowBackupCenter(true)
                  setOpen(false)
                }}
                variant="subtle"
                fullWidth
                size="sm"
                justify="flex-start"
                className="border-t app-border px-4 py-3 app-text-secondary transition hover:app-bg-tertiary"
              >
                备份中心
              </Button>
              <Button
                onClick={() => {
                  setShowCleanupDialog(true)
                  setOpen(false)
                }}
                variant="subtle"
                fullWidth
                size="sm"
                justify="flex-start"
                className="border-t app-border px-4 py-3 app-text-secondary transition hover:app-bg-tertiary"
              >
                清理 OpenClaw
              </Button>
              <Button
                onClick={() => {
                  setShowDataCleanupDialog(true)
                  setOpen(false)
                }}
                variant="subtle"
                fullWidth
                size="sm"
                justify="flex-start"
                className="border-t app-border px-4 py-3 app-text-secondary transition hover:app-bg-tertiary"
              >
                清理 OpenClaw 数据
              </Button>
            </div>
          </>
        )}
      </div>

      <UpdateCenter open={showUpdateCenter} onClose={() => setUpdateCenterVisibility(false)} />
      <BackupCenter open={showBackupCenter} onClose={() => setShowBackupCenter(false)} />
      <CleanupDialog
        open={showCleanupDialog}
        mode="remove-openclaw"
        onClose={() => setShowCleanupDialog(false)}
      />
      <OpenClawDataCleanupDialog
        open={showDataCleanupDialog}
        onClose={() => setShowDataCleanupDialog(false)}
      />
    </>
  )
}
