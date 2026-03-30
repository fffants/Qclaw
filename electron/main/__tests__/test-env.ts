const DEFAULT_TEST_ENV = {
  APP_ROOT: '/test/app',
  VITE_PUBLIC: '/test/public',
} satisfies Partial<NodeJS.ProcessEnv>

export function buildTestEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...DEFAULT_TEST_ENV,
    ...overrides,
  } as NodeJS.ProcessEnv
}
