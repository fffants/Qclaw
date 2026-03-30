import { describe, expect, it } from 'vitest'
import {
  applyFeishuMultiBotIsolation,
  detectFeishuIsolationDrift,
  getFeishuManagedAgentId,
  getFeishuManagedWorkspace,
} from './feishu-multi-bot-routing'

describe('applyFeishuMultiBotIsolation', () => {
  it('adds dmScope, managed agents, and managed bindings for every configured feishu bot', () => {
    const next = applyFeishuMultiBotIsolation({
      channels: {
        feishu: {
          enabled: true,
          appId: 'cli_default',
          appSecret: 'secret-default',
          accounts: {
            work: {
              enabled: true,
              name: '工作机器人',
              appId: 'cli_work',
              appSecret: 'secret-work',
            },
          },
        },
      },
    })

    expect(next.session.dmScope).toBe('per-account-channel-peer')
    expect(next.agents.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: getFeishuManagedAgentId('default'),
          workspace: getFeishuManagedWorkspace('default'),
        }),
        expect.objectContaining({
          id: getFeishuManagedAgentId('work'),
          workspace: getFeishuManagedWorkspace('work'),
        }),
      ])
    )
    expect(next.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: getFeishuManagedAgentId('default'),
          match: { channel: 'feishu', accountId: 'default' },
        }),
        expect.objectContaining({
          agentId: getFeishuManagedAgentId('work'),
          match: { channel: 'feishu', accountId: 'work' },
        }),
      ])
    )
  })

  it('preserves unrelated user-defined agents and bindings', () => {
    const next = applyFeishuMultiBotIsolation({
      agents: {
        list: [{ id: 'custom-agent', name: 'Custom Agent', workspace: '~/.openclaw/custom' }],
      },
      bindings: [{ agentId: 'custom-agent', match: { channel: 'discord' } }],
      channels: {
        feishu: {
          enabled: true,
          appId: 'cli_default',
          appSecret: 'secret-default',
        },
      },
    })

    expect(next.agents.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'custom-agent' })])
    )
    expect(next.bindings).toEqual(
      expect.arrayContaining([expect.objectContaining({ agentId: 'custom-agent' })])
    )
  })

  it('migrates stale legacy feishu-bot config into feishu-default before cleanup', () => {
    const next = applyFeishuMultiBotIsolation({
      agents: {
        list: [
          { id: 'custom-agent', name: 'Custom Agent', workspace: '~/.openclaw/custom' },
          { id: 'feishu-bot', model: 'minimax/MiniMax-M2.1', temperature: 0.2, default: true },
          { id: 'feishu-default', name: '默认 Bot Agent', workspace: '~/.openclaw/workspace-feishu-default' },
        ],
      },
      bindings: [
        { agentId: 'custom-agent', match: { channel: 'discord' } },
        { agentId: 'feishu-bot', match: { channel: 'feishu', accountId: 'default' } },
      ],
      channels: {
        feishu: {
          enabled: true,
          appId: 'cli_default',
          appSecret: 'secret-default',
        },
      },
    })

    expect(next.agents.list).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: 'feishu-bot' })])
    )
    expect(next.agents.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'custom-agent' })])
    )
    const migratedAgent = next.agents.list.find((agent: Record<string, any>) => agent.id === getFeishuManagedAgentId('default'))
    expect(migratedAgent).toEqual(
      expect.objectContaining({
        id: getFeishuManagedAgentId('default'),
        model: 'minimax/MiniMax-M2.1',
        temperature: 0.2,
        workspace: getFeishuManagedWorkspace('default'),
      })
    )
    expect(migratedAgent?.default).toBeUndefined()
    expect(next.bindings).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ agentId: 'feishu-bot' })])
    )
    expect(next.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: getFeishuManagedAgentId('default'),
          match: { channel: 'feishu', accountId: 'default' },
        }),
      ])
    )
  })

  it('keeps explicit feishu-default config when both managed and legacy agents exist', () => {
    const next = applyFeishuMultiBotIsolation({
      agents: {
        list: [
          { id: 'feishu-bot', model: 'minimax/MiniMax-M2.1', temperature: 0.2 },
          { id: 'feishu-default', model: 'openai/gpt-5.4-pro', temperature: 0.8 },
        ],
      },
      channels: {
        feishu: {
          enabled: true,
          appId: 'cli_default',
          appSecret: 'secret-default',
        },
      },
    })

    const managedAgent = next.agents.list.find((agent: Record<string, any>) => agent.id === getFeishuManagedAgentId('default'))
    expect(managedAgent).toEqual(
      expect.objectContaining({
        id: getFeishuManagedAgentId('default'),
        model: 'openai/gpt-5.4-pro',
        temperature: 0.8,
      })
    )
    expect(next.agents.list).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: 'feishu-bot' })])
    )
  })

  it('preserves legacy feishu-bot when no default bot exists to migrate into', () => {
    const next = applyFeishuMultiBotIsolation({
      agents: {
        list: [
          { id: 'feishu-bot', model: 'minimax/MiniMax-M2.1' },
        ],
      },
      bindings: [
        { agentId: 'feishu-bot', match: { channel: 'feishu', accountId: 'default' } },
      ],
      channels: {
        feishu: {
          enabled: true,
        },
      },
    })

    expect(next.agents.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'feishu-bot', model: 'minimax/MiniMax-M2.1' })])
    )
    expect(next.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: 'feishu-bot', match: { channel: 'feishu', accountId: 'default' } }),
      ])
    )
  })
})

describe('detectFeishuIsolationDrift', () => {
  it('detects missing bindings, dmScope drift, and conflicting account routing', () => {
    const drift = detectFeishuIsolationDrift({
      session: {
        dmScope: 'per-channel-peer',
      },
      agents: {
        list: [{ id: getFeishuManagedAgentId('default'), workspace: '~/.openclaw/workspace' }],
      },
      bindings: [{ agentId: 'custom-agent', match: { channel: 'feishu', accountId: 'default' } }],
      channels: {
        feishu: {
          enabled: true,
          appId: 'cli_default',
          appSecret: 'secret-default',
        },
      },
    })

    expect(drift.needsRepair).toBe(true)
    expect(drift.dmScopeCorrect).toBe(false)
    expect(drift.workspaceMismatches).toContain(getFeishuManagedAgentId('default'))
    expect(drift.missingBindingAccountIds).toContain('default')
    expect(drift.conflictingBindingAccountIds).toContain('default')
  })
})
