import { describe, expect, it } from 'vitest';
import { keyShapeProblem } from './keyShape';

describe('keyShapeProblem', () => {
  it('refuses any sk- key with Gemini selected', () => {
    expect(keyShapeProblem('gemini', 'sk-abc123')).toEqual({ message: "This isn't a Google key. Which provider is it from?" });
    expect(keyShapeProblem('gemini', 'AIzaSyExample')).toBeNull();
  });

  it('checks sk-ant- and sk-or- before the generic sk-', () => {
    expect(keyShapeProblem('gemini', 'sk-ant-api03-x')?.likely).toBe('anthropic');
    expect(keyShapeProblem('gemini', 'sk-or-v1-x')?.likely).toBe('openrouter');
    expect(keyShapeProblem('deepseek', 'sk-ant-api03-x')?.likely).toBe('anthropic');
    expect(keyShapeProblem('openai', 'sk-or-v1-x')?.likely).toBe('openrouter');
  });

  it('suggests the switch for a known foreign prefix', () => {
    expect(keyShapeProblem('deepseek', 'sk-or-v1-abc')).toEqual({
      likely: 'openrouter',
      message: 'This looks like an OpenRouter key — switch to OpenRouter?',
    });
    expect(keyShapeProblem('qwen', 'AIzaSyExample')).toMatchObject({ likely: 'gemini' });
    expect(keyShapeProblem('deepseek', 'sk-proj-abc')).toMatchObject({ likely: 'openai' });
  });

  it('lets plain sk- keys through where they cannot be told apart', () => {
    for (const provider of ['deepseek', 'qwen', 'openai'] as const) expect(keyShapeProblem(provider, 'sk-0123abcd')).toBeNull();
    expect(keyShapeProblem('openai', 'sk-proj-abc')).toBeNull();
    expect(keyShapeProblem('anthropic', 'sk-ant-api03-x')).toBeNull();
    expect(keyShapeProblem('openrouter', ' sk-or-v1-x ')).toBeNull();
  });

  it('flags a key without the provider’s own prefix, with no guess', () => {
    expect(keyShapeProblem('anthropic', 'sk-0123abcd')).toEqual({ message: "This doesn't look like an Anthropic Claude key." });
    expect(keyShapeProblem('openrouter', 'sk-0123abcd')?.likely).toBeUndefined();
  });

  it('never checks custom servers, Ollama, or an empty field', () => {
    expect(keyShapeProblem('custom', 'sk-ant-x')).toBeNull();
    expect(keyShapeProblem('ollama', 'AIzaX')).toBeNull();
    expect(keyShapeProblem('gemini', '   ')).toBeNull();
  });
});
