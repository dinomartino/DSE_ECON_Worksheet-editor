import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { highlighted, menuGroups, runnableIds } from '@/components/ai/aiMenuModel';
import { createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import { useWorksheetStore } from '@/store/worksheetStore';
import { withFlow } from '@/test/fixtures';
import { openAi, useAiMenu } from './menuStore';
import { PAUSED_VERBS, isPaused, setPausedForTest } from './paused';
import { registerVerb, resetVerbsForTest, verbs } from './registry';
import { resetAiRunForTest, useAiRun } from './runStore';
import type { AiVerb, VerbContext, VerbGroup } from './types';
import './verbs';

/** What the real registry holds before any test resets it. */
const registered = verbs().map((v) => v.id);
const PAUSED = ['write.answers', 'create.fromSource', 'check.quality'];

const q1 = createStructuredQuestion();
q1.blocks = [createParagraphBlock(bi('Explain demand.', ''))];
const worksheet = withFlow(createWorksheet(), [q1]);
const ctx = (): VerbContext => ({ worksheet, mode: { language: 'en', version: 'student' }, scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });

const runs: string[] = [];
function fake(id: string, group: VerbGroup, label: string): AiVerb {
  return {
    id,
    group,
    order: 0,
    needsKey: false,
    label: () => label,
    available: () => ({}),
    run: async () => {
      runs.push(id);
      return { kind: 'nothing', summary: 'done' };
    },
  };
}

const listed = (query = '') => menuGroups(ctx(), query).flatMap((g) => g.rows.map((r) => r.verb.id));

describe('PAUSED_VERBS', () => {
  beforeEach(() => {
    resetVerbsForTest();
    resetAiRunForTest();
    runs.length = 0;
    useWorksheetStore.getState().replaceWorksheet(worksheet);
    registerVerb(fake('translate.fillZh', 'translate', 'Fill missing 中文'));
    registerVerb(fake('check.terms', 'check', 'Check terms'));
    registerVerb(fake('write.answers', 'write', 'Write answers & mark scheme'));
    registerVerb(fake('create.fromSource', 'create', 'Questions from a source…'));
    registerVerb(fake('check.quality', 'check', 'Check question quality'));
  });
  afterEach(() => {
    setPausedForTest(null);
    resetAiRunForTest();
    useAiMenu.getState().close();
  });

  it('pauses E1, E3 and E4 — still registered, so their own tests keep running', () => {
    expect([...PAUSED_VERBS].sort()).toEqual([...PAUSED].sort());
    for (const id of PAUSED) expect(registered).toContain(id);
    expect(isPaused('translate.fillZh') || isPaused('check.terms')).toBe(false);
  });

  it('the menu never lists a paused verb, even for a matching search or a preselect', () => {
    expect(listed()).toEqual(['translate.fillZh', 'check.terms']);
    for (const query of ['answers', 'mark scheme', 'source', 'quality', 'check']) {
      for (const id of PAUSED) expect(listed(query)).not.toContain(id);
    }
    const groups = menuGroups(ctx());
    expect(groups.map((g) => g.group)).toEqual(['translate', 'check']);
    for (const id of PAUSED) {
      expect(runnableIds(groups)).not.toContain(id);
      expect(highlighted(groups, id, id)).toBe('translate.fillZh');
    }
  });

  it('startVerb refuses a paused id: nothing runs and the menu stays open', async () => {
    for (const id of PAUSED) {
      openAi({ scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });
      await useAiRun.getState().startVerb(id, 'x'.repeat(200));
      expect(useAiRun.getState().phase).toEqual({ kind: 'idle' });
      expect(useAiMenu.getState().open).not.toBeNull();
    }
    expect(runs).toEqual([]);
    await useAiRun.getState().startVerb('check.terms');
    expect(runs).toEqual(['check.terms']);
  });

  it('removing an id from the set brings that verb back — menu and run', async () => {
    setPausedForTest(PAUSED.filter((id) => id !== 'check.quality'));
    expect(listed()).toEqual(['translate.fillZh', 'check.terms', 'check.quality']);
    expect(listed('quality')).toEqual(['check.quality']);
    expect(highlighted(menuGroups(ctx()), undefined, 'check.quality')).toBe('check.quality');
    await useAiRun.getState().startVerb('check.quality');
    await useAiRun.getState().startVerb('write.answers');
    expect(runs).toEqual(['check.quality']);

    setPausedForTest([]);
    expect(listed()).toEqual(['translate.fillZh', 'check.terms', 'check.quality', 'write.answers', 'create.fromSource']);
  });

  it('a paused verb is never asked what it offers (its engine does no work)', () => {
    const available = vi.fn(() => ({}));
    registerVerb({ ...fake('write.answers', 'write', 'Write answers & mark scheme'), available });
    menuGroups(ctx());
    menuGroups(ctx(), 'answers');
    expect(available).not.toHaveBeenCalled();
  });
});
