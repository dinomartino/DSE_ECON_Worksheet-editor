// The demo video. STORYBOARD is the whole film: one named step per beat, played in
// order on camera. `speed` > 1 fast-forwards that step in the final cut (for typing
// that would otherwise drag). To show a new feature, add a step.
import fs from 'node:fs';
import path from 'node:path';
import { MCQS, STRUCTURED } from './content.mjs';
import {
  CONTEXT, CURSOR_SCRIPT, makeDriver, field, flowRow, answerButton, partInput,
  buildQuiz, buildLibrary,
} from './flow.mjs';

const Q1 = MCQS[0];
const Q2 = MCQS[1];
const SQ = 2; // the structured question's index on camera: after Q1 and Q2

async function insertBelowOnCamera(d, rowText, kind) {
  const row = flowRow(d.page, rowText);
  await d.hover(row, { at: 0.6 });
  await d.wait(250);
  await d.click(row.getByRole('button', { name: 'Insert here' }), { hover: 450 });
  await d.wait(600);
  await d.click(d.page.getByRole('menuitem', { name: kind }));
  await d.wait(800);
}

export const STORYBOARD = [
  {
    name: 'Start screen',
    caption: 'The start screen, with saved worksheets.',
    async run(d) {
      await d.wait(600);
      await d.moveTo(700, 400);
      await d.wait(1200);
    },
  },
  {
    name: 'New bilingual worksheet',
    caption: 'Clicks **Classroom worksheet**, picks **EN+中**, then **Create worksheet**.',
    async run(d) {
      await d.click(d.page.getByText('Classroom worksheet', { exact: true }));
      await d.wait(1000);
      await d.click(d.page.getByRole('dialog').getByTitle('Bilingual'));
      await d.wait(700);
      await d.click(d.page.getByRole('button', { name: /Create worksheet/ }));
      await d.wait(1400);
    },
  },
  {
    name: 'Insert an MCQ',
    caption: 'Hovers under "Section A", clicks the insert **+**, and chooses **Multiple Choice**.',
    run: (d) => insertBelowOnCamera(d, 'Section A', /Multiple Choice/),
  },
  {
    name: 'Type the stem',
    caption: `Double-clicks the page and types "${Q1.stem[0]}" and ${Q1.stem[1]}`,
    async run(d) {
      await d.typeInto(field(d.page, 0, 0), Q1.stem[0], { delay: 32, after: 250 });
      await d.typeInto(field(d.page, 0, 1), Q1.stem[1], { delay: 75, after: 250 });
    },
  },
  {
    name: 'English options',
    speed: 2.5,
    caption: 'Types the four English options.',
    async run(d) {
      for (let k = 0; k < 4; k++)
        await d.typeInto(field(d.page, 0, 2 + 2 * k), Q1.options[k][0], { delay: 30, after: 120 });
    },
  },
  {
    name: 'Chinese options',
    speed: 3,
    caption: 'Adds their Chinese versions.',
    async run(d) {
      for (let k = 0; k < 4; k++)
        await d.typeInto(field(d.page, 0, 3 + 2 * k), Q1.options[k][1], { delay: 0, after: 150 });
    },
  },
  {
    name: 'Mark the answer',
    caption: `Marks **${Q1.answer}** as the correct answer in the sidebar.`,
    async run(d) {
      await d.wait(300);
      await d.click(answerButton(d.page, Q1.answer), { hover: 350 });
      await d.wait(700);
    },
  },
  {
    name: 'Second MCQ from the rail',
    caption: 'Adds another MCQ from the **Question** rail.',
    async run(d) {
      await d.click(d.page.getByRole('button', { name: /^Question/ }));
      await d.wait(550);
      await d.click(d.page.getByRole('menuitem', { name: /Multiple Choice/ }));
      await d.wait(600);
    },
  },
  {
    name: 'Fill the second MCQ',
    speed: 4,
    caption: `Fills it in both languages and marks **${Q2.answer}**.`,
    async run(d) {
      await d.typeInto(field(d.page, 1, 0), Q2.stem[0], { delay: 0, after: 120 });
      await d.typeInto(field(d.page, 1, 1), Q2.stem[1], { delay: 0, after: 120 });
      for (let k = 0; k < 4; k++) {
        await d.typeInto(field(d.page, 1, 2 + 2 * k), Q2.options[k][0], { delay: 0, after: 100 });
        await d.typeInto(field(d.page, 1, 3 + 2 * k), Q2.options[k][1], { delay: 0, after: 100 });
      }
      await d.click(answerButton(d.page, Q2.answer));
      await d.wait(300);
    },
  },
  {
    name: 'Insert a structured question',
    caption: 'Hovers under "Section B" and inserts a **Structured Question**.',
    async run(d) {
      await d.wait(600);
      await insertBelowOnCamera(d, 'Section B', /Structured/);
    },
  },
  {
    name: 'Type the scenario',
    speed: 2,
    caption: 'Types the scenario.',
    run: (d) => d.typeInto(field(d.page, SQ, 0), STRUCTURED.stem[0], { delay: 26, after: 200 }),
  },
  {
    name: 'Chinese line and part (a)',
    speed: 3,
    caption: 'Adds its Chinese line and part (a). The marks label appears.',
    async run(d) {
      await d.typeInto(field(d.page, SQ, 1), STRUCTURED.stem[1], { delay: 0, after: 150 });
      await d.typeInto(field(d.page, SQ, 2), STRUCTURED.parts[0].text[0], { delay: 0, after: 150 });
      await d.typeInto(field(d.page, SQ, 3), STRUCTURED.parts[0].text[1], { delay: 0, after: 150 });
    },
  },
  {
    name: 'Answer lines',
    caption: `Sets **Lines** to ${STRUCTURED.parts[0].lines} in the sidebar. Dotted answer lines appear.`,
    async run(d) {
      await d.click(partInput(d.page, 'a', 'lines'), { hover: 300 });
      await d.page.keyboard.type(String(STRUCTURED.parts[0].lines), { delay: 60 });
      await d.page.keyboard.press('Tab');
      await d.wait(1300);
    },
  },
  {
    name: 'Teacher version',
    caption: 'Scrolls up and switches **Student → Teacher**. The answers appear in red. Switches back.',
    async run(d) {
      await d.moveTo(650, 450);
      await d.wheel(-60, 24, 30);
      await d.wait(500);
      await d.click(d.page.getByTitle(/Teacher version/));
      await d.wait(2200);
      await d.click(d.page.getByTitle(/Student version/));
      await d.wait(900);
    },
  },
  {
    name: 'Paper versions',
    caption: 'Opens **Setup**, sets **Versions** to 3 ("Version A" appears on the page), and closes it.',
    async run(d) {
      await d.click(d.page.getByRole('button', { name: 'Setup' }));
      await d.wait(1000);
      const dialog = d.page.getByRole('dialog');
      await d.moveTo(900, 600);
      await d.click(dialog.getByText('3', { exact: true }), { hover: 350 });
      await d.wait(1500);
      await d.click(dialog.getByRole('button', { name: /close/i }));
      await d.wait(800);
    },
  },
  {
    name: 'Export',
    caption: 'Opens **Export…** and clicks through Question paper → Answer key → Both → Other apps → Kahoot, then **Cancel**. Nothing is downloaded.',
    async run(d) {
      await d.click(d.page.getByRole('button', { name: /Export/ }));
      await d.wait(1300);
      const dialog = d.page.getByRole('dialog');
      for (const [tab, dwell] of [['Answer key', 750], ['Both', 750], ['Other apps', 1100], ['Kahoot', 1200]]) {
        await d.click(dialog.getByText(tab, { exact: true }));
        await d.wait(dwell);
      }
      await d.click(dialog.getByRole('button', { name: 'Cancel' }));
      await d.wait(700);
    },
  },
  {
    name: 'Finished page',
    caption: 'Closes the inspector and scrolls to the finished page.',
    async run(d) {
      await d.click(d.page.getByRole('button', { name: 'Close editor' }));
      await d.wait(500);
      await d.moveTo(650, 520);
      await d.wheel(50, 9);
      await d.moveTo(1000, 640);
      await d.wait(2300);
    },
  },
];

/** Record STORYBOARD through `filmSteps`, after seeding a library off camera. */
export async function recordStoryboard({ browser, url, tmpDir, log }) {
  // Off camera: seed a library, so the start screen is not empty.
  log('video: seeding saved worksheets…');
  const seedCtx = await browser.newContext(CONTEXT);
  const seed = makeDriver(await seedCtx.newPage(), { url });
  await buildQuiz(seed);
  await seed.wait(1500);
  await buildLibrary(seed);
  const storageState = await seedCtx.storageState();
  await seedCtx.close();

  const ctx = await browser.newContext({ ...CONTEXT, deviceScaleFactor: 1, storageState });
  await ctx.addInitScript(CURSOR_SCRIPT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`  page error: ${e.message}`));
  const d = makeDriver(page, { smooth: true, url });
  await page.goto(url, { waitUntil: 'networkidle' });
  await d.wait(800);
  await page.mouse.move(820, 520);

  const rec = await filmSteps({ ctx, page, d, steps: STORYBOARD, tmpDir, log });
  await ctx.close();
  return rec;
}

/**
 * Film `steps` on `page` as JPEG frames (Chrome's screencast, sharper than recordVideo's
 * 1 Mbit VP8), then lay them onto a constant 30 fps timeline with each step's speed.
 * Adds `d.cut(fn)` to the driver: whatever `fn` does is left out of the film (a still
 * being captured, geometry read off the page). Returns the frame sequence and the
 * output start time of every step.
 */
export async function filmSteps({ ctx, page, d, steps, tmpDir, log }) {
  const framesDir = path.join(tmpDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = path.join(framesDir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ t: metadata.timestamp, wall: Date.now() / 1000, file });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1440, maxHeight: 900 });

  const marks = []; // { wall, step, cut?, resume? }
  let current = null;
  d.cut = async (fn) => {
    marks.push({ wall: Date.now() / 1000, step: current, cut: true });
    try {
      return await fn();
    } finally {
      marks.push({ wall: Date.now() / 1000, step: current, resume: true });
    }
  };
  log('video: recording…');
  for (const step of steps) {
    current = step;
    marks.push({ wall: Date.now() / 1000, step });
    log(`  ${step.name}${step.speed ? ` (×${step.speed})` : ''}`);
    try {
      await step.run(d);
    } catch (e) {
      await page.screenshot({ path: path.join(tmpDir, 'failed-step.png') });
      throw new Error(`storyboard step "${step.name}" failed: ${e.message}\n(screenshot: ${tmpDir}/failed-step.png)`);
    }
  }
  const endWall = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  if (!frames.length) throw new Error('video: the screencast produced no frames');

  // Frame clock ↔ wall clock. Output time is frame time divided by the speed of the
  // mark it falls under, integrated piecewise; a cut has infinite speed.
  const offset = frames[0].wall - frames[0].t;
  const at = marks.map((m) => m.wall - offset);
  const speed = (m) => (m.cut ? Infinity : (m.step.speed ?? 1));
  const outBetween = (t0, t1) => {
    let out = 0;
    for (let i = 0; i < marks.length; i++) {
      const lo = Math.max(t0, i === 0 ? -Infinity : at[i]);
      const hi = Math.min(t1, i + 1 < marks.length ? at[i + 1] : Infinity);
      if (hi > lo) out += (hi - lo) / speed(marks[i]);
    }
    return out;
  };
  const end = endWall - offset;
  const starts = [];
  let acc = 0;
  for (let i = 0; i < frames.length; i++) {
    const t0 = frames[i].t;
    const t1 = i + 1 < frames.length ? frames[i + 1].t : end;
    const dur = outBetween(t0, t1);
    if (dur <= 0) continue;
    starts.push({ at: acc, file: frames[i].file });
    acc += dur;
  }
  // Output start time of each step, for the README storyboard.
  const timeline = marks
    .map((m, i) => ({ m, t: at[i] }))
    .filter(({ m }) => !m.cut && !m.resume)
    .map(({ m, t }) => ({ at: Math.max(0, outBetween(frames[0].t, t)), step: m.step }));

  // A constant 30 fps sequence of links into the captured frames.
  const FPS = 30;
  const seqDir = path.join(tmpDir, 'seq');
  fs.mkdirSync(seqDir, { recursive: true });
  const count = Math.floor(acc * FPS);
  let j = 0;
  for (let k = 0; k < count; k++) {
    while (j + 1 < starts.length && starts[j + 1].at <= k / FPS) j++;
    fs.symlinkSync(starts[j].file, path.join(seqDir, `${String(k).padStart(6, '0')}.jpg`));
  }
  return { seqPattern: path.join(seqDir, '%06d.jpg'), fps: FPS, duration: count / FPS, timeline };
}
