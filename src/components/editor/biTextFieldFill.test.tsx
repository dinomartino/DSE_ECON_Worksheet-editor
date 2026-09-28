import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { missingSide } from '@/model/textSlots';
import type { BiText } from '@/model/types';

// The walker's real `fieldNeedsFill` lands with P-TEXT; until then, missingSide minus
// digits-and-symbols text stands in (the integration run drops this mock).
vi.mock('@/model/textWalk', () => ({
  fieldNeedsFill: (text: BiText) => {
    const side = missingSide(text);
    const present = (side === 'zh' ? text.en : text.zh).map((run) => run.text).join('');
    return side && /[A-Za-z一-鿿]{3,}/.test(present) ? side : null;
  },
}));
const store = { mode: { language: 'bilingual' }, readOnly: false };
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: (select: (s: typeof store) => unknown) => select(store),
}));
const ai = { configured: true };
vi.mock('@/settings/aiSettings', () => ({ useAiStatus: () => ai }));

const { BiTextField } = await import('./BiTextField');

const t = (en: string, zh: string): BiText => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const render = (value: BiText, translate?: { kind: 'answer' }) =>
  renderToStaticMarkup(<BiTextField label="Model answer" value={value} onChange={() => {}} translate={translate} />);

beforeEach(() => {
  store.mode.language = 'bilingual';
  store.readOnly = false;
  ai.configured = true;
});

describe('BiTextField fill', () => {
  it('shows no fill button without the translate prop, but still the tag', () => {
    const markup = render(t('Supply falls', ''));
    expect(markup).toContain('needs translation');
    expect(markup).not.toContain('Fill 中文');
  });

  it('offers Fill under the missing side when the field says what it holds', () => {
    expect(render(t('Supply falls', ''), { kind: 'answer' })).toContain('>Fill 中文</button>');
    expect(render(t('', '供應減少'), { kind: 'answer' })).toContain('>Fill English</button>');
  });

  it('gives a symbol-only answer in EN+中 neither the button nor the tag', () => {
    const markup = render(t('$14 000', ''), { kind: 'answer' });
    expect(markup).not.toContain('Fill');
    expect(markup).not.toContain('needs translation');
  });

  it('is absent in a one-language edition and in a read-only document', () => {
    store.mode.language = 'zh';
    expect(render(t('Supply falls', ''), { kind: 'answer' })).not.toContain('Fill');
    store.mode.language = 'bilingual';
    store.readOnly = true;
    expect(render(t('Supply falls', ''), { kind: 'answer' })).not.toContain('Fill');
  });

  it('without a provider, offers setup in a panel', () => {
    ai.configured = false;
    expect(render(t('Supply falls', ''), { kind: 'answer' })).toContain('>Set up translation…</button>');
  });
});
