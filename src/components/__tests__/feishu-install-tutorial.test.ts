import { describe, expect, it } from 'vitest'

import {
  FEISHU_INSTALL_TUTORIAL_STEPS,
  getFeishuInstallTutorialPrimaryActionLabel,
} from '../feishu-install-tutorial'

describe('feishu install tutorial copy', () => {
  it('keeps the tutorial aligned with the requested seven-step onboarding flow', () => {
    expect(FEISHU_INSTALL_TUTORIAL_STEPS).toHaveLength(7)
    expect(FEISHU_INSTALL_TUTORIAL_STEPS[0]?.title).toContain('第 1 步')
    expect(FEISHU_INSTALL_TUTORIAL_STEPS[6]?.title).toContain('第 7 步')
  })

  it('uses the provided screenshots across all seven steps and keeps two images in step one', () => {
    expect(FEISHU_INSTALL_TUTORIAL_STEPS[0]?.images).toHaveLength(2)
    expect(FEISHU_INSTALL_TUTORIAL_STEPS[0]?.images.map((image) => image.switchLabel)).toEqual([
      '入口页',
      '飞书页签',
    ])

    for (const step of FEISHU_INSTALL_TUTORIAL_STEPS) {
      expect(step.images.length).toBeGreaterThan(0)
      for (const image of step.images) {
        expect(image.src).toBeTruthy()
        expect(image.alt).toContain('飞书步骤')
      }
    }
  })

  it('preserves the QR refresh warning for the scan authorization step', () => {
    expect(FEISHU_INSTALL_TUTORIAL_STEPS[2]?.note).toContain('等待刷新')
    expect(FEISHU_INSTALL_TUTORIAL_STEPS[2]?.note).toContain('已刷新')
  })
})

describe('getFeishuInstallTutorialPrimaryActionLabel', () => {
  it('uses next-step wording until the last screen and then switches to finish', () => {
    expect(getFeishuInstallTutorialPrimaryActionLabel(0)).toBe('下一步')
    expect(getFeishuInstallTutorialPrimaryActionLabel(5)).toBe('下一步')
    expect(getFeishuInstallTutorialPrimaryActionLabel(6)).toBe('完成')
  })
})
