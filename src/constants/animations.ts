/**
 * 统一的动画配置
 */

export const TRANSITIONS = {
  pageChange: {
    duration: 300,
    timingFunction: 'ease-in-out',
  },
  slideIn: {
    duration: 200,
    timingFunction: 'ease-out',
  },
  fadeIn: {
    duration: 150,
    timingFunction: 'ease-in',
  },
} as const

export const PAGE_TRANSITIONS = {
  forward: 'slide-left', // 下一步：从右滑入
  backward: 'slide-right', // 上一步：从左滑入
  fade: 'fade', // 其他：淡入淡出
} as const
