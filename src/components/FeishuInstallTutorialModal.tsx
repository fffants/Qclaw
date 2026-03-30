import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Group, Modal, Stack, Text } from '@mantine/core'

import {
  FEISHU_INSTALL_TUTORIAL_STEPS,
  getFeishuInstallTutorialPrimaryActionLabel,
} from './feishu-install-tutorial'

interface FeishuInstallTutorialModalProps {
  opened: boolean
  onClose: () => void
}

export default function FeishuInstallTutorialModal({
  opened,
  onClose,
}: FeishuInstallTutorialModalProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [activeStepImageIndex, setActiveStepImageIndex] = useState(0)
  const [imagePreviewOpened, setImagePreviewOpened] = useState(false)

  useEffect(() => {
    if (opened) {
      setActiveStepIndex(0)
      setActiveStepImageIndex(0)
      setImagePreviewOpened(false)
    }
  }, [opened])

  useEffect(() => {
    setActiveStepImageIndex(0)
    setImagePreviewOpened(false)
  }, [activeStepIndex])

  const activeStep = FEISHU_INSTALL_TUTORIAL_STEPS[activeStepIndex]
  const activeStepImage = activeStep.images[activeStepImageIndex] || activeStep.images[0]
  const isFirstStep = activeStepIndex === 0
  const isLastStep = activeStepIndex === FEISHU_INSTALL_TUTORIAL_STEPS.length - 1

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        centered
        size="xl"
        title={(
          <Group gap="xs">
            <Text fw={700}>飞书机器人配置教程</Text>
            <Badge size="sm" variant="light" color="success">
              {activeStepIndex + 1} / {FEISHU_INSTALL_TUTORIAL_STEPS.length}
            </Badge>
          </Group>
        )}
      >
        <Stack gap="md">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-start">
            <div className="space-y-3">
              <div className="rounded-xl border app-border app-bg-secondary px-4 py-4">
                <Text size="sm" fw={700} mb="xs">{activeStep.title}</Text>
                <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }}>
                  {activeStep.description}
                </Text>

                {activeStep.bullets && activeStep.bullets.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {activeStep.bullets.map((item) => (
                      <div key={item} className="flex gap-2">
                        <Text size="sm" fw={700} className="app-text-success">-</Text>
                        <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }}>
                          {item}
                        </Text>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {activeStep.note && (
                <Alert color="blue" variant="light" title="提示">
                  <Text size="sm">{activeStep.note}</Text>
                </Alert>
              )}
            </div>

            <div className="rounded-xl border app-border app-bg-secondary px-4 py-4">
              <Group justify="space-between" align="center" mb="sm" gap="xs">
                <Text size="xs" fw={700} c="dimmed">步骤示意图</Text>
                {activeStep.images.length > 1 && (
                  <Group gap={8}>
                    {activeStep.images.map((image, index) => (
                      <Button
                        key={image.alt}
                        size="xs"
                        variant={index === activeStepImageIndex ? 'filled' : 'default'}
                        color={index === activeStepImageIndex ? 'success' : undefined}
                        onClick={() => setActiveStepImageIndex(index)}
                      >
                        {image.switchLabel || `图片 ${index + 1}`}
                      </Button>
                    ))}
                  </Group>
                )}
              </Group>

              <button
                type="button"
                onClick={() => setImagePreviewOpened(true)}
                className="block w-full overflow-hidden rounded-xl border app-border bg-black/30 text-left transition-opacity hover:opacity-95"
                style={{ cursor: 'zoom-in' }}
                aria-label={`放大查看${activeStepImage.alt}`}
              >
                <img
                  src={activeStepImage.src}
                  alt={activeStepImage.alt}
                  className="block w-full object-contain"
                  style={{ maxHeight: 'min(34vh, 280px)' }}
                />
              </button>

              <Text size="xs" c="dimmed" mt="xs">
                点击图片可放大查看
              </Text>

              {activeStepImage.caption && (
                <Text size="xs" c="dimmed" mt="sm" style={{ lineHeight: 1.7 }}>
                  {activeStepImage.caption}
                </Text>
              )}
            </div>
          </div>

          <Group justify="space-between">
            <Button
              variant="default"
              onClick={() => setActiveStepIndex((current) => Math.max(0, current - 1))}
              disabled={isFirstStep}
            >
              上一步
            </Button>
            <Button
            color="success"
            onClick={() => {
              if (isLastStep) {
                onClose()
                return
              }
              setActiveStepIndex((current) => Math.min(FEISHU_INSTALL_TUTORIAL_STEPS.length - 1, current + 1))
              }}
            >
              {getFeishuInstallTutorialPrimaryActionLabel(activeStepIndex)}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={imagePreviewOpened}
        onClose={() => setImagePreviewOpened(false)}
        centered
        size="90vw"
        title={(
          <Text fw={600} size="sm">
            {activeStep.title}
          </Text>
        )}
      >
        <Stack gap="sm">
          <div className="overflow-hidden rounded-xl border app-border bg-black/30">
            <img
              src={activeStepImage.src}
              alt={activeStepImage.alt}
              className="block w-full object-contain"
              style={{ maxHeight: '78vh' }}
            />
          </div>

          {activeStepImage.caption && (
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }}>
              {activeStepImage.caption}
            </Text>
          )}
        </Stack>
      </Modal>
    </>
  )
}
