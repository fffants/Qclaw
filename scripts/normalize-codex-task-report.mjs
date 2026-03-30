#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

function extractByPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function inferGateFromText(text, label) {
  const explicit = extractByPatterns(text, [
    /FINAL_GATE:\s*`?([A-Z0-9_]+)`?/i,
    /当前结论是\s*`?([A-Z0-9_]+)`?/i,
    /当前 gate 已写为[:：]?\s*`?FINAL_GATE:\s*([A-Z0-9_]+)`?/i,
  ])
  if (explicit) return explicit

  if (label.includes('phase3-t1')) {
    if (/不建议进入\s*`?PM1`?/i.test(text)) return 'BLOCK'
    if (/建议进入\s*`?PM1`?/i.test(text)) return 'PASS_TO_PM1'
  }
  if (label.includes('phase3-pm1')) {
    if (/不允许进入主控收敛|不能进入主控收敛/i.test(text)) return 'BLOCK'
    if (/允许进入主控收敛/i.test(text)) return 'PASS_TO_C1'
  }
  if (label.includes('phase3-c1')) {
    if (/是否允许进入 commit[\s\S]*否|不允许进入 commit/i.test(text)) return 'BLOCK'
    if (/允许进入 commit|可进入保存\/commit|是否允许进入 commit[\s\S]*是/i.test(text)) return 'READY_TO_COMMIT'
  }
  if (label.includes('phase3-r1')) {
    if (/当前无|建议进入\s*`?T1`?/i.test(text)) return 'READY_FOR_T1'
  }
  if (label.includes('phase3-r2')) {
    if (/建议重新进入\s*`?T1`?|建议重新进入\s*`?PM1`?|READY_FOR_RECHECK/i.test(text)) return 'READY_FOR_RECHECK'
  }
  if (/建议进入\s*`?T1`?/i.test(text)) return 'READY_FOR_T1'
  if (/PASS_TO_PHASE2/i.test(text)) return 'PASS_TO_PHASE2'
  return ''
}

function inferSeverityFromText(text) {
  const explicit = extractByPatterns(text, [
    /HIGHEST_OPEN_SEVERITY:\s*`?((?:NONE|P[0-3]))`?/i,
    /最高未决级别(?:是)?[:：]?\s*`?((?:NONE|P[0-3]))`?/i,
    /最高未关闭级别(?:是)?[:：]?\s*`?((?:NONE|P[0-3]))`?/i,
  ])
  if (explicit) return explicit

  if (/剩余无法关闭的\s*`?P0\/P1`?[:：]?\s*当前无/i.test(text)) return 'NONE'
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const resolvedKeywords = /(已修复|已关闭|fixed|resolved|closed|处理完成|当前无)/i
  const activeKeywords = /(Blocking|\u963b\u585e|未关闭|未决|remaining|残留|still open|open issue|open severity)/i

  for (const severity of ['P0', 'P1', 'P2', 'P3']) {
    const severityPattern = new RegExp(String.raw`(?:^|[^A-Z0-9_])` + '`?' + severity + '`?' + String.raw`(?:[^A-Z0-9_]|$)`, 'i')
    const bulletPattern = new RegExp(String.raw`^[-*]\s*` + '`?' + severity + '`?' + String.raw`\s*[:：]`, 'i')

    for (const line of lines) {
      if (!severityPattern.test(line)) continue
      if (resolvedKeywords.test(line)) continue
      if (activeKeywords.test(line) || bulletPattern.test(line)) return severity
    }
  }

  return ''
}

function main() {
  const args = parseArgs(process.argv)
  const filePath = args.file
  if (!filePath) {
    console.error('Missing --file')
    process.exit(1)
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const label = String(args.label || path.basename(filePath, path.extname(filePath)))
  const expectGate = String(args['expect-gate'] || '')

  let normalized = raw.replace(/\r\n/g, '\n')
  const gate = inferGateFromText(normalized, label)
  const severity = inferSeverityFromText(normalized)

  const hasPlainGate = /^FINAL_GATE:\s*[A-Z0-9_]+\s*$/m.test(normalized)
  const hasPlainSeverity = /^HIGHEST_OPEN_SEVERITY:\s*(?:NONE|P[0-3])\s*$/m.test(normalized)

  let mutated = false
  if (!hasPlainGate && gate) {
    normalized = normalized.replace(/\s*$/, '\n')
    normalized += `FINAL_GATE: ${gate}\n`
    mutated = true
  }
  if (!hasPlainSeverity && severity) {
    normalized = normalized.replace(/\s*$/, '\n')
    normalized += `HIGHEST_OPEN_SEVERITY: ${severity}\n`
    mutated = true
  }

  if (mutated) {
    fs.writeFileSync(filePath, normalized, 'utf8')
  }

  const finalGate = extractByPatterns(normalized, [/^FINAL_GATE:\s*([A-Z0-9_]+)\s*$/m])
  const finalSeverity = extractByPatterns(normalized, [/^HIGHEST_OPEN_SEVERITY:\s*((?:NONE|P[0-3]))\s*$/m])

  if (expectGate && finalGate && finalGate !== expectGate && finalGate !== 'BLOCK') {
    console.error(`Unexpected gate after normalization: ${finalGate} (expected ${expectGate} or BLOCK)`)
  }

  process.stdout.write(`FINAL_GATE=${finalGate || ''}\n`)
  process.stdout.write(`HIGHEST_OPEN_SEVERITY=${finalSeverity || ''}\n`)
}

main()
