// A placeholder act: its COPY as a stack of bilingual title lines on cream, revealed a
// beat apart, with an eyebrow naming the act. Replace with the real scene.
import { h, show, C, FONT } from './dom.js';
import { block } from './type.js';
import { outSoft, prog } from './ease.js';

export function placeholder(n) {
  return {
    setup(ctx) {
      h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
      const keys = Object.keys(ctx.copy);
      const size = keys.length > 3 ? 64 : 76;
      const blocks = keys.map((k) => block(ctx.el, { ...ctx.copy[k], x: 960, y: 0, w: 1560, maxLines: 2, size }));
      const gap = 44;
      const total = blocks.reduce((s, b) => s + b.height, 0) + gap * (blocks.length - 1);
      let y = 540 - total / 2 + 30;
      for (const b of blocks) {
        b.el.style.top = `${y}px`;
        y += b.height + gap;
      }
      ctx.eyebrow = h('div', { text: `${String(n).padStart(2, '0')}  ${ctx.id.toUpperCase()}  ·  PLACEHOLDER`, style: {
        position: 'absolute', left: '96px', right: '96px', top: `${540 - total / 2 - 70}px`, textAlign: 'center',
        font: `600 22px ${FONT.sans}`, letterSpacing: '0.08em', color: C.accent,
      } }, ctx.el);
      ctx.blocks = blocks;
    },
    update(ctx, t) {
      show(ctx.eyebrow, outSoft(prog(t, 0, 0.6)));
      ctx.blocks.forEach((b, i) => b.show(t, { at: ctx.beat(1 + 2 * i) }));
    },
  };
}
