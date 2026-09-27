#!/usr/bin/env node
// Prints the timeline as JSON for non-JS consumers (the Python score).
import { BPM, BEAT, BAR, FPS, W, H, DURATION, SCENES, SECTIONS, CUES, CHORDS, COPY } from './timeline.mjs';

const data = { BPM, BEAT, BAR, FPS, W, H, DURATION, SCENES, SECTIONS, CUES, CHORDS, COPY };
process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
