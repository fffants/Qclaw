#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const scriptEntries = {
  vitest: path.join(rootDir, 'node_modules', 'vitest', 'vitest.mjs'),
  tsc: path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
}

const args = new Set(process.argv.slice(2))
const skipTypecheck = args.has('--skip-typecheck')

const scenarios = [
  {
    name: '场景1-首次配置（能力发现 + 认证编排 + 配置验证）',
    script: 'vitest',
    args: [
      'run',
      'src/pages/__tests__/model-center.test.tsx',
      'electron/main/__tests__/openclaw-capabilities.test.ts',
      'electron/main/__tests__/openclaw-auth-orchestrator.test.ts',
    ],
  },
  {
    name: '场景2-追加配置（Dashboard 状态来源与提供商聚合）',
    script: 'vitest',
    args: [
      'run',
      'src/pages/__tests__/dashboard-entry-flow.test.tsx',
      'src/pages/__tests__/dashboard-initial-load.test.ts',
      'src/pages/__tests__/dashboard-provider-extraction.test.ts',
      'src/pages/__tests__/models-page-state.test.ts',
      'src/shared/__tests__/dashboard-entry-bootstrap.test.ts',
    ],
  },
  {
    name: '场景3-模型切换（default/image model 命令映射）',
    script: 'vitest',
    args: [
      'run',
      'electron/main/__tests__/openclaw-model-config.test.ts',
      '-t',
      'maps every action to expected openclaw command args',
    ],
  },
  {
    name: '场景4-fallback 与 scan（fallback/image-fallback + models scan）',
    script: 'vitest',
    args: ['run', 'electron/main/__tests__/openclaw-model-config.test.ts'],
  },
]

if (!skipTypecheck) {
  scenarios.push({
    name: '补充校验-TypeScript 类型检查',
    script: 'tsc',
    args: ['--noEmit'],
  })
}

async function ensureLocalToolExists(toolName) {
  const entryPath = scriptEntries[toolName]
  try {
    await access(entryPath)
  } catch {
    throw new Error(`未找到本地 ${toolName} 入口：${entryPath}\n请先执行依赖安装（例如 npm install / pnpm install）。`)
  }
  return entryPath
}

async function runNodeEntry(name, entryPath, entryArgs) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath, ...entryArgs], {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${name} 被信号 ${signal} 中断`))
        return
      }
      if (code !== 0) {
        reject(new Error(`${name} 失败，退出码 ${code ?? 'unknown'}`))
        return
      }
      resolve()
    })
  })
}

async function main() {
  console.log('Qclaw 模型中心回归脚本')
  console.log(`项目目录: ${rootDir}`)
  if (skipTypecheck) {
    console.log('模式: 跳过 TypeScript 类型检查（--skip-typecheck）')
  }

  for (const scenario of scenarios) {
    console.log('')
    console.log(`==> [${scenario.name}]`)
    const entryPath = await ensureLocalToolExists(scenario.script)
    await runNodeEntry(scenario.name, entryPath, scenario.args)
  }

  console.log('')
  console.log('✅ 模型中心回归脚本执行完成。')
}

main().catch((error) => {
  console.error('')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
