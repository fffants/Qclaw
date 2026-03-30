import { describe, expect, it } from 'vitest'
import {
  canonicalizeModelProviderId,
  getModelProviderAliasCandidates,
} from '../model-provider-aliases'

describe('model provider aliases', () => {
  it('normalizes oauth provider aliases to their canonical model provider ids', () => {
    expect(canonicalizeModelProviderId('openai-codex')).toBe('openai')
    expect(canonicalizeModelProviderId('google-gemini-cli')).toBe('google')
    expect(canonicalizeModelProviderId('gemini')).toBe('google')
    expect(canonicalizeModelProviderId('qwen-portal')).toBe('qwen')
    expect(canonicalizeModelProviderId('minimax-portal')).toBe('minimax')
  })

  it('returns canonical id plus known alias candidates', () => {
    expect(getModelProviderAliasCandidates('openai')).toEqual(['openai', 'openai-codex'])
    expect(getModelProviderAliasCandidates('google')).toEqual(['google', 'gemini', 'google-gemini-cli'])
  })
})
