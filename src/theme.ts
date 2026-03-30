import { createTheme, virtualColor, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core'

const VALID_COLOR_SCHEMES = new Set(['light', 'dark', 'auto'])

export function shouldClearStoredColorScheme(value: string | null | undefined): boolean {
  if (!value) return false
  return !VALID_COLOR_SCHEMES.has(value)
}

// 橙色系 - 主操作色 (brand)
const brand: MantineColorsTuple = [
  '#fff4e6', '#ffe8cc', '#ffd8a8', '#ffc078',
  '#ffa94d', '#ff922b', '#f76707', '#e8590c',
  '#d9480f', '#bf4000',
]

// 红色系 - 错误/危险
const danger: MantineColorsTuple = [
  '#fff5f5', '#ffe3e3', '#ffc9c9', '#ffa8a8',
  '#ff8787', '#ff6b6b', '#fa5252', '#f03e3e',
  '#e03131', '#c92a2a',
]

// 黄色系 - 警告
const warning: MantineColorsTuple = [
  '#fffce8', '#fff9db', '#fff3bf', '#ffec99',
  '#ffe066', '#ffd43b', '#fcc419', '#fab005',
  '#f59f00', '#e67700',
]

// 青绿色系 - 成功/就绪
const success: MantineColorsTuple = [
  '#e6fcf5', '#c3fae8', '#96f2d7', '#63e6be',
  '#38d9a9', '#20c997', '#12b886', '#0ca678',
  '#099268', '#087f5b',
]

// 中性色 - 背景/卡片 (zinc-like)
const surface: MantineColorsTuple = [
  '#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8',
  '#a1a1aa', '#71717a', '#52525b', '#3f3f46',
  '#27272a', '#18181b',
]

// 覆盖 Mantine 内置 dark 色板，对齐 Tailwind zinc
const dark: MantineColorsTuple = [
  '#d4d4d8', // dark.0 - 最亮文字
  '#a1a1aa', // dark.1
  '#71717a', // dark.2
  '#52525b', // dark.3
  '#3f3f46', // dark.4 - 边框/分割线
  '#27272a', // dark.5 - 悬浮/hover
  '#1f1f23', // dark.6 - 组件背景 (Card/Modal)
  '#18181b', // dark.7 - 页面主体背景 (body)
  '#0f0f11', // dark.8
  '#09090b', // dark.9
]

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 7 },
  autoContrast: true,
  fontFamily: '"AlibabaPuHuiTi", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: '"SF Mono", "Fira Code", monospace',
  defaultRadius: 'md',
  cursorType: 'pointer',
  black: '#09090b',
  white: '#fafafa',
  colors: {
    brand,
    danger,
    warning,
    success,
    surface,
    dark,
    primary: virtualColor({
      name: 'primary',
      dark: 'brand',
      light: 'brand',
    }),
  },
  components: {
    Button: {
      defaultProps: { radius: 'md' },
    },
    TextInput: {
      defaultProps: { radius: 'md' },
    },
    PasswordInput: {
      defaultProps: { radius: 'md' },
    },
    Select: {
      defaultProps: { radius: 'md' },
    },
    Card: {
      defaultProps: { radius: 'lg', withBorder: true },
    },
    Modal: {
      defaultProps: { radius: 'lg', centered: true },
    },
    Alert: {
      defaultProps: { radius: 'md' },
    },
    Badge: {
      defaultProps: { radius: 'sm' },
    },
  },
})

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#fafafa',
    '--mantine-color-default': '#ffffff',
    '--mantine-color-default-hover': '#f4f4f5',
    '--mantine-color-default-color': '#27272a',
    '--mantine-color-default-border': '#e4e4e7',
    '--mantine-color-dimmed': '#71717a',
    '--mantine-color-text': '#18181b',
    '--mantine-color-anchor': '#e8590c',
    /* 语义化应用色 */
    '--app-bg-primary': '#fafafa',
    '--app-bg-secondary': '#ffffff',
    '--app-bg-tertiary': '#f4f4f5',
    '--app-bg-inset': '#e4e4e7',
    '--app-bg-input': '#ffffff',
    '--app-bg-bubble-user': 'rgba(32, 201, 151, 0.1)',
    '--app-bg-bubble-assistant': '#f4f4f5',
    '--app-text-primary': '#18181b',
    '--app-text-secondary': '#3f3f46',
    '--app-text-tertiary': '#52525b',
    '--app-text-muted': '#71717a',
    '--app-text-faint': '#a1a1aa',
    '--app-text-bubble-user': '#065f46',
    '--app-text-bubble-assistant': '#27272a',
    '--app-border': '#e4e4e7',
    '--app-border-light': '#d4d4d8',
    '--app-text-success': '#059669',
    '--app-text-warning': '#d97706',
    '--app-text-danger': '#dc2626',
    '--app-text-info': '#0891b2',
    '--app-hover-border': '#f76707',
    '--app-hover-glow': 'rgba(247, 103, 7, 0.25)',
  },
  dark: {
    '--mantine-color-body': '#1c1c1f',
    '--mantine-color-default': '#2a2a2e',
    '--mantine-color-default-hover': '#3f3f46',
    '--mantine-color-default-color': '#e4e4e7',
    '--mantine-color-default-border': '#3f3f46',
    '--mantine-color-dimmed': '#8a8a95',
    '--mantine-color-text': '#e4e4e7',
    '--mantine-color-anchor': '#ffa94d',
    /* 语义化应用色 */
    '--app-bg-primary': '#0f0f11',
    '--app-bg-secondary': '#1c1c1f',
    '--app-bg-tertiary': '#2a2a2e',
    '--app-bg-inset': '#0f0f11',
    '--app-bg-input': '#1c1c1f',
    '--app-bg-bubble-user': 'rgba(52, 211, 153, 0.15)',
    '--app-bg-bubble-assistant': '#27272a',
    '--app-text-primary': '#f4f4f5',
    '--app-text-secondary': '#e4e4e7',
    '--app-text-tertiary': '#b0b0b8',
    '--app-text-muted': '#8a8a95',
    '--app-text-faint': '#626268',
    '--app-text-bubble-user': '#a7f3d0',
    '--app-text-bubble-assistant': '#e4e4e7',
    '--app-border': '#27272a',
    '--app-border-light': '#3f3f46',
    '--app-text-success': '#34d399',
    '--app-text-warning': '#fbbf24',
    '--app-text-danger': '#f87171',
    '--app-text-info': '#22d3ee',
    '--app-hover-border': '#ffa94d',
    '--app-hover-glow': 'rgba(255, 169, 77, 0.3)',
  },
})
