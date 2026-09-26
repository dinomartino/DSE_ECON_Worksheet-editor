// The demo video. STORYBOARD is the whole film: one named step per beat, played in
// order on camera. `speed` > 1 fast-forwards that step in the final cut (for typing
// that would otherwise drag). `caption` describes the step for the README; `d.say`
// puts subtitles on screen, timed to the action (§ subtitles.mjs). To show a new
// feature, add a step.
import fs from 'node:fs';
import path from 'node:path';
import { MCQS, STRUCTURED } from './content.mjs';
import {
  CONTEXT, CURSOR_SCRIPT, makeDriver, field, flowRow, answerButton, partInput, question,
  buildQuiz, buildLibrary,
} from './flow.mjs';
import { auditCues, withSubtitles } from './subtitles.mjs';
import { renderFrames, withCamera } from './camera.mjs';

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
      await d.say('The start screen lists your worksheets.');
      await d.moveTo(700, 400);
      await d.wait(1200);
    },
  },
  {
    name: 'New bilingual worksheet',
    caption: 'Clicks **Classroom worksheet**, picks **EN+中**, then **Create worksheet**.',
    async run(d) {
      await d.say('Start a new Classroom worksheet.');
      await d.click(d.page.getByText('Classroom worksheet', { exact: true }));
      await d.wait(500);
      const dialog = d.page.getByRole('dialog');
      await d.focus([dialog.getByText('Document type', { exact: true }), dialog.getByTitle('Bilingual')], {
        name: 'the new-worksheet dialog', pad: 50,
      });
      await d.say('EN+中 makes it bilingual.');
      await d.click(dialog.getByTitle('Bilingual'));
      await d.wait(700);
      await d.focus(null);
      await d.click(d.page.getByRole('button', { name: /Create worksheet/ }));
      await d.wait(1400);
    },
  },
  {
    name: 'Insert an MCQ',
    caption: 'Hovers under "Section A", clicks the insert **+**, and chooses **Multiple Choice**.',
    async run(d) {
      await d.say('Hover under Section A, click +,\nand choose Multiple Choice.');
      await insertBelowOnCamera(d, 'Section A', /Multiple Choice/);
    },
  },
  {
    name: 'Type the stem',
    caption: `Double-clicks the page and types "${Q1.stem[0]}" and ${Q1.stem[1]}`,
    async run(d) {
      await d.say('Double-click the page and type.');
      await d.show(field(d.page, 0, 0));
      await d.focus(question(d.page, 0), { name: 'the question', pad: 70, maxZoom: 1.8 });
      await d.typeInto(field(d.page, 0, 0), Q1.stem[0], { delay: 32, after: 250 });
      await d.say('The Chinese version goes right below.');
      await d.typeInto(field(d.page, 0, 1), Q1.stem[1], { delay: 75, after: 250 });
    },
  },
  {
    name: 'English options',
    speed: 2.5,
    caption: 'Types the four English options.',
    async run(d) {
      await d.say('Type the four options in English.');
      for (let k = 0; k < 4; k++)
        await d.typeInto(field(d.page, 0, 2 + 2 * k), Q1.options[k][0], { delay: 30, after: 120 });
    },
  },
  {
    name: 'Chinese options',
    speed: 3,
    caption: 'Adds their Chinese versions.',
    async run(d) {
      await d.say('Then their Chinese versions.');
      for (let k = 0; k < 4; k++)
        await d.typeInto(field(d.page, 0, 3 + 2 * k), Q1.options[k][1], { delay: 0, after: 150 });
    },
  },
  {
    name: 'Mark the answer',
    caption: `Marks **${Q1.answer}** as the correct answer in the sidebar.`,
    async run(d) {
      await d.say(`Mark ${Q1.answer} as the answer in the sidebar.`);
      await d.focus(null);
      await d.click(answerButton(d.page, Q1.answer), { hover: 350 });
      await d.wait(700);
    },
  },
  {
    name: 'Second MCQ from the rail',
    caption: 'Adds another MCQ from the **Question** rail.',
    async run(d) {
      await d.say('Or add a question from the rail.');
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
      await d.say(`Fill it in both languages and mark ${Q2.answer}.`);
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
      await d.say('Under Section B,\ninsert a Structured Question.');
      await d.wait(600);
      await insertBelowOnCamera(d, 'Section B', /Structured/);
    },
  },
  {
    name: 'Type the scenario',
    speed: 2,
    caption: 'Types the scenario.',
    async run(d) {
      await d.say('Type the scenario.');
      await d.show(field(d.page, SQ, 0));
      await d.focus(question(d.page, SQ), { name: 'the structured question', pad: 110, maxZoom: 1.8 });
      await d.typeInto(field(d.page, SQ, 0), STRUCTURED.stem[0], { delay: 26, after: 200 });
    },
  },
  {
    name: 'Chinese line and part (a)',
    speed: 3,
    caption: 'Adds its Chinese line and part (a). The marks label appears.',
    async run(d) {
      await d.say('Add the Chinese line and part (a).');
      await d.typeInto(field(d.page, SQ, 1), STRUCTURED.stem[1], { delay: 0, after: 150 });
      await d.typeInto(field(d.page, SQ, 2), STRUCTURED.parts[0].text[0], { delay: 0, after: 150 });
      await d.say('The marks label appears on its own.');
      await d.typeInto(field(d.page, SQ, 3), STRUCTURED.parts[0].text[1], { delay: 0, after: 150 });
    },
  },
  {
    name: 'Answer lines',
    caption: `Sets **Lines** to ${STRUCTURED.parts[0].lines} in the sidebar. Dotted answer lines appear.`,
    async run(d) {
      await d.say(`Set Lines to ${STRUCTURED.parts[0].lines} in the sidebar.`);
      await d.focus(null);
      await d.click(partInput(d.page, 'a', 'lines'), { hover: 300 });
      await d.page.keyboard.type(String(STRUCTURED.parts[0].lines), { delay: 60 });
      await d.page.keyboard.press('Tab');
      await d.say('Dotted answer lines appear.');
      await d.wait(1300);
    },
  },
  {
    name: 'Teacher version',
    caption: 'Scrolls up and switches **Student → Teacher**. The answers appear in red. Switches back.',
    async run(d) {
      await d.say('Switch to the Teacher version.');
      await d.moveTo(650, 450);
      await d.wheel(-60, 24, 30);
      await d.wait(500);
      await d.click(d.page.getByTitle(/Teacher version/));
      await d.say('The answers appear in red.');
      await d.wait(300);
      await d.focus([question(d.page, 0), question(d.page, 1)], { name: 'the answers', pad: 40, maxZoom: 1.8 });
      await d.wait(1400);
      await d.say('Switch back for the student copy.');
      await d.focus(null);
      await d.click(d.page.getByTitle(/Student version/));
      await d.wait(900);
    },
  },
  {
    name: 'Paper versions',
    caption: 'Opens **Setup**, sets **Versions** to 3 ("Version A" appears on the page), and closes it.',
    async run(d) {
      await d.say('Open Setup and set Versions to 3.');
      await d.click(d.page.getByRole('button', { name: 'Setup' }));
      await d.wait(600);
      const dialog = d.page.getByRole('dialog');
      await d.focus([dialog.getByText('Versions', { exact: true }), dialog.getByText('4', { exact: true })], {
        name: 'Versions in Setup', pad: 60, maxZoom: 1.8,
      });
      await d.moveTo(900, 600);
      await d.click(dialog.getByText('3', { exact: true }), { hover: 350 });
      await d.say('The paper now has versions A, B and C.');
      await d.wait(700);
      await d.focus(null);
      await d.wait(500);
      await d.click(dialog.getByRole('button', { name: /close/i }));
      await d.wait(800);
    },
  },
  {
    name: 'Export',
    caption: 'Opens **Export…** and clicks through Question paper → Answer key → Both → Other apps → Kahoot, then **Cancel**. Nothing is downloaded.',
    async run(d) {
      await d.say('Export the question paper,\nthe answer key, or both.');
      await d.click(d.page.getByRole('button', { name: /Export/ }));
      await d.wait(1300);
      const dialog = d.page.getByRole('dialog');
      for (const [tab, dwell] of [['Answer key', 750], ['Both', 750], ['Other apps', 1100], ['Kahoot', 1200]]) {
        if (tab === 'Other apps') await d.say('Or export for Kahoot, Blooket or ZipGrade.');
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
      await d.say('The finished worksheet, ready to print.');
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

  // Filmed at 2×, so the camera's push-ins stay sharp (§ camera.mjs).
  const ctx = await browser.newContext({ ...CONTEXT, deviceScaleFactor: 2, storageState });
  await ctx.addInitScript(CURSOR_SCRIPT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`  page error: ${e.message}`));
  const d = withCamera(withSubtitles(makeDriver(page, { smooth: true, url })));
  await page.goto(url, { waitUntil: 'networkidle' });
  await d.wait(800);
  await page.mouse.move(820, 520);

  const rec = await filmSteps({ ctx, page, d, steps: STORYBOARD, tmpDir, log });
  await ctx.close();
  return rec;
}

/**
 * Film `steps` on `page` as 2× JPEG frames (Chrome's screencast, sharper than
 * recordVideo's 1 Mbit VP8), then lay them onto a constant 30 fps timeline with each
 * step's speed, through the camera and with the subtitles on top (§ camera.mjs).
 * Adds `d.cut(fn)` to the driver: whatever `fn` does is left out of the film (a still
 * being captured, geometry read off the page). Returns the frame sequence and the
 * output start time of every step, subtitle (`d.say`) and camera move (`d.focus`).
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 2880, maxHeight: 1800 });

  const marks = []; // { wall, step, cut?, resume? }
  let current = null;
  // The film clock: output seconds so far, while recording (a cut stops it).
  let clockAt = Date.now() / 1000;
  let clockOut = 0;
  let rate = 1;
  const mark = (m) => {
    clockOut += (m.wall - clockAt) * rate;
    clockAt = m.wall;
    rate = m.cut ? 0 : 1 / (m.step?.speed ?? 1);
    marks.push(m);
  };
  d.clock = () => clockOut + (Date.now() / 1000 - clockAt) * rate;
  d.speedNow = () => current?.speed ?? 1;
  d.step = () => current;
  d.cut = async (fn) => {
    mark({ wall: Date.now() / 1000, step: current, cut: true });
    try {
      return await fn();
    } finally {
      mark({ wall: Date.now() / 1000, step: current, resume: true });
    }
  };
  log('video: recording…');
  for (const step of steps) {
    current = step;
    mark({ wall: Date.now() / 1000, step });
    log(`  ${step.name}${step.speed ? ` (×${step.speed})` : ''}`);
    try {
      await step.run(d);
    } catch (e) {
      await page.screenshot({ path: path.join(tmpDir, 'failed-step.png') });
      throw new Error(`storyboard step "${step.name}" failed: ${e.message}\n(screenshot: ${tmpDir}/failed-step.png)`);
    }
  }
  if (d.focus) await d.focus(null);
  if (d.say) {
    await d.say(''); // the last subtitle gets its reading time, then fades
    await d.wait(400);
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

  // Output start time of each subtitle and camera move; warnings where a subtitle breaks the rules.
  const outAt = (wall) => Math.max(0, outBetween(frames[0].t, wall - offset));
  const cues = (d.cues ?? []).map((c) => ({ ...c, at: outAt(c.wall) }));
  const shots = (d.shots ?? []).map((s) => ({ ...s, at: outAt(s.wall) }));
  if (cues.length) {
    const shown = cues.filter((c) => c.text);
    const warnings = auditCues(cues, acc);
    const fastest = Math.max(...shown.map((c) => [...c.text].length / c.duration));
    log(`video: ${shown.length} subtitles, ${Math.min(...shown.map((c) => c.duration)).toFixed(1)}–` +
      `${Math.max(...shown.map((c) => c.duration)).toFixed(1)} s each, at most ${fastest.toFixed(1)} characters/s`);
    for (const w of warnings) log(`  subtitle: ${w}`);
  }
  for (const s of shots) log(`  camera ${s.at.toFixed(1)} s: ${s.rect ? `${(1440 / s.rect.w).toFixed(2)}× on ${s.name}` : 'full frame'}`);

  // A constant 30 fps sequence, through the camera, with the subtitles.
  const FPS = 30;
  const seqDir = path.join(tmpDir, 'seq');
  fs.mkdirSync(seqDir, { recursive: true });
  const count = Math.floor(acc * FPS);
  const seqPattern = await renderFrames({ browser: ctx.browser(), starts, count, fps: FPS, shots, cues, end: acc, seqDir, log });
  return { seqPattern, fps: FPS, duration: count / FPS, timeline, cues, shots };
}
