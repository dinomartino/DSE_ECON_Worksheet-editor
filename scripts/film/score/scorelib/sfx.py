"""Sound design (FILM.md §7.2): cue sounds (hit, whoosh, riser, swell, tick) and UI sounds
(click, key, drag-start, drag-end, toggle), each placed sample-accurately and levelled in LU
against the music. Reads build/events.json when the stage has written it, else the timeline cues.

events.json: a list (or {"events": [...]}) of {t, kind, strength?, to?, peak?, pan?, label?, scene?},
film seconds. `to` is a riser's end, `peak` a whoosh's loudest instant, `pan` -1..1 (UI events).
A clip's UI events are what the app did, not what the film should sound like: ui_filter thins them."""
import json
from collections import Counter

import numpy as np

from .arrangement import Score, at
from .common import AUDIO, EVENTS, S, file_sha256, nsamples, read_wav, timeline_sha256, write_wav
from .dsp import (add_at, bp, cosramp, db, gate_breaths, hp, loudness_curve, lp, lufs_window, mono_low, mtof,
                  noise, pan, phase, reverb, reverb_ir, rng, saw, seconds, sine, softclip, svf, tail_fade)

TWO_PI = 2 * np.pi
CUE_KINDS = {'hit', 'whoosh', 'riser', 'swell', 'tick', 'breath', 'drop', 'end'}
UI_KINDS = {'click', 'key', 'drag-start', 'drag-end', 'toggle'}
# Level of each kind, LU relative to the music's loudness in its dense sections, measured on the
# sound's loudest 100 ms; strength moves it by 12 dB per decade around REF_STRENGTH.
LEVEL = {'hit': -3.0, 'whoosh': -8.0, 'riser': -6.0, 'swell': -14.0, 'tick': -18.0,
         'click': -24.0, 'key': -28.0, 'drag-start': -26.0, 'drag-end': -26.0, 'toggle': -22.0}
REF_STRENGTH = {'hit': 0.9, 'whoosh': 0.6, 'riser': 0.8, 'swell': 0.5, 'tick': 0.45}
DENSE_BARS = ((8, 32), (34, 42))
# Levelled against the louder of that reference and the music's own 3 s around the sound, so a
# busy passage cannot mask them.
LOCAL_LEVEL = {'whoosh', 'tick'}
# UI thinning: events closer than MERGE_S merge into the first (a double-click is one click);
# a key sounds only for a printable character, at most once per KEY_GAP_S; nothing sounds
# under a cue tick or hit.
MERGE_S, KEY_GAP_S, UNDER_CUE_S = 0.09, 0.125, 0.06
# Per scene, the UI sounds it keeps: the drawing keeps its gestures and the tool that starts
# each; the montage's cut ticks carry its shots.
SCENE_UI = {
    'diagrams': lambda e: e['kind'] in ('drag-start', 'drag-end')
    or (e['kind'] == 'click' and e.get('label') in ('Curve', 'Shift a copy', 'Shade', 'Add')),
    'montage': lambda e: e['kind'] != 'key',
}
WHOOSH_PEAK = 0.06  # s after t, unless the cue gives `peak`
# Local masking: a picture accent must stand this far (dB) over the music in its own band at
# its own instant (a tick on a clap backbeat), raised by at most `most` dB above its level.
UNMASK = {'tick': {'floor': 2.0, 'most': 8.0}, 'whoosh': {'floor': -3.0, 'most': 6.0}}
# Picture accents in the final chorus sit above the arp's top (A6): ticks from C7 up.
FINAL_TICKS = (96, 106)


def _onset(n, ms=0.4):
    e = np.ones(n)
    k = max(S(ms / 1000), 1)
    e[:k] = cosramp(k)
    return e


def with_verb(dry, send, kind, amt, **kw):
    """dry (n, 2) plus a reverb of `send`, lengthened so the tail is never cut."""
    tail = len(reverb_ir(kind))
    out = np.zeros((len(dry) + tail, 2))
    out[:len(dry)] = dry
    pad = np.concatenate([send, np.zeros((tail,) + send.shape[1:])])
    out += amt * reverb(pad, kind, **kw)
    return tail_fade(out, 0.05)


# ---------------------------------------------------------------- cue sounds (return start offset, stereo)


def hit(strength, key, sub_hz=36.7):
    """`sub_hz`: the boom settles on the bass's root, never a third fundamental under the bass
    and kick (D1 where no bass plays, and on the big D-major end)."""
    big = strength >= 0.99
    soft = strength < 0.6
    n = S(9.5 if big else 4.5)
    t = seconds(n)
    f = sub_hz * (1 + (0.8 if soft else 1.4) * np.exp(-t / 0.08))
    sub = softclip(np.sin(TWO_PI * phase(f)) * 1.4, 1.2) * np.exp(-t / (0.3 if soft else 1.5 if big else 0.3 + 0.6 * strength))
    burst_lp = 1400 if soft else 2500 + 6000 * strength
    burst = lp(hp(noise(n, ('hit', key)), 50), burst_lp) * np.exp(-t / (0.04 + 0.08 * strength))
    y = 0.9 * sub + (0.35 if soft else 0.8) * burst
    if not big:  # a 110-220 Hz body on an octave of the root, so the hit reads on a laptop
        fb = sub_hz * 2 ** np.ceil(np.log2(110.0 / sub_hz))
        body = softclip(np.sin(TWO_PI * phase(fb * (1 + 0.25 * np.exp(-t / 0.03)))), 1.5)
        y += 0.3 * body * np.exp(-t / 0.14)
    if not soft:
        y += 0.35 * strength * hp(noise(n, ('crack', key)), 2500) * np.exp(-t / 0.009)
    if big:
        for m, a in ((38, 0.35), (45, 0.22), (50, 0.16)):
            y += a * sine(float(mtof(m)), n) * np.exp(-t / 1.7)
    y = tail_fade(y * _onset(n), 0.3)
    send = y * (0.5 if big else 0.35) if not soft else 0.2 * burst
    return 0, with_verb(pan(y, 0.0), send, 'tail', 0.9 if big else 0.6, hp_hz=120)


def whoosh(strength, key):
    pre, post, peak = 0.55, 0.6, WHOOSH_PEAK
    n = S(pre + post)
    tau = seconds(n) - pre
    rise = np.clip((tau + pre) / (pre + peak), 0, 1) ** 2.6
    fall = np.exp(-np.clip(tau - peak, 0, None) / 0.17)
    env = np.where(tau < peak, rise, fall)
    u = np.clip((tau + pre) / (pre + post), 0, 1)
    fc = np.exp(np.interp(u, [0, (pre + peak) / (pre + post), 1], np.log([380, 2400 + 1200 * strength, 700])))
    air = svf(noise(n, ('whoosh', key)), fc, 1.3, 'bp')
    body = lp(noise(n, ('whoosh-body', key)), 500) * 0.35
    y = (air + body) * env
    p = np.interp(u, [0, 1], [-0.7, 0.7])
    return -S(pre), with_verb(pan(y, p), y, 'plate', 0.25)


def riser(length, strength, key):
    n = S(length)
    u = seconds(n) / length
    fc = 280 * (9000 / 280) ** (u ** 1.4)
    nz = svf(noise(n, ('riser', key)), fc, 0.9 + 1.6 * u, 'bp')
    f = float(mtof(50)) * 2 ** (2 * u ** 1.3)
    tone = sum(saw(f * 2 ** (c / 1200), phase0=k / 3) for k, c in enumerate((-12, 0, 12)))
    tone = svf(tone, 400 * (8000 / 400) ** u, 0.8)
    trem_rate = 6 + 20 * u ** 2
    trem = 0.7 + 0.3 * np.cos(TWO_PI * phase(trem_rate))
    trem = np.where(u > 0.55, trem, 1.0)
    amp = db(-32 + 32 * u ** 1.8)
    y = (0.9 * nz + 0.18 * tone) * amp * trem
    y *= _onset(n, 5)
    y = tail_fade(y, 0.005)
    w = np.interp(u, [0, 1], [0.1, 0.6])
    st = np.stack([y * (1 - 0.5 * w), y * (1 - 0.5 * w)], axis=1)
    for c in range(2):  # decorrelated width: sums in mono, never cancels
        st[:, c] += svf(noise(n, ('riser-side', key, c)), fc, 1.2, 'bp') * amp * trem * 0.35 * w
    return 0, tail_fade(st * _onset(n, 5)[:, None], 0.005)


def swell(strength, key, pitches):
    n = S(3.6)
    t = seconds(n)
    env = np.where(t < 1.2, np.sin(np.pi / 2 * t / 1.2) ** 2, np.cos(np.pi / 2 * np.clip((t - 1.2) / 2.4, 0, 1)) ** 2)
    y = np.zeros(n)
    r = rng('swell', key)
    for m in pitches:
        for c in (-4, 4):
            y += np.sin(TWO_PI * float(mtof(m)) * 2 ** (c / 1200) * t + r.uniform(0, TWO_PI))
    y = y / max(len(pitches), 1) + 0.25 * bp(noise(n, ('swell', key)), 500, 3000)
    y = lp(y, 2500) * env
    return 0, with_verb(pan(y, 0.0) * 0.6, y, 'hall', 0.8)


def tick(m, strength, key):
    n = S(0.7)
    t = seconds(n)
    fc = float(mtof(m))
    ph = TWO_PI * fc * t
    y = np.sin(ph + 1.7 * np.exp(-t / 0.018) * np.sin(3.5 * ph)) * np.exp(-t / 0.12)
    if 2.01 * fc < 18000:
        y += 0.3 * np.sin(2.01 * ph) * np.exp(-t / 0.05)
    y += 0.12 * hp(noise(n, ('tick', key)), 4000) * np.exp(-t / 0.0015)
    y = tail_fade(y * _onset(n), 0.02)
    return 0, with_verb(pan(y, 0.0), y, 'plate', 0.3)


# ---------------------------------------------------------------- UI sounds


def click(key):
    n = S(0.05)
    t = seconds(n)
    y = 0.7 * np.sin(TWO_PI * 1150 * t) * np.exp(-t / 0.003)
    y += 0.45 * bp(noise(n, ('click', key)), 2000, 7000) * np.exp(-t / 0.0012)
    y += 0.5 * np.sin(TWO_PI * 240 * t) * np.exp(-t / 0.006)
    return tail_fade(y * _onset(n, 0.2), 0.005)


def key_tap(key):
    r = rng('key', key)
    n = S(0.04)
    t = seconds(n)
    f = r.uniform(520, 820)
    y = 0.5 * bp(noise(n, ('key', key)), 1300, 5200) * np.exp(-t / r.uniform(0.0025, 0.0045))
    y += 0.35 * np.sin(TWO_PI * f * t) * np.exp(-t / 0.005)
    return tail_fade(y * _onset(n, 0.2), 0.005) * r.uniform(0.8, 1.1)


def drag(key, up):
    n = S(0.09)
    t = seconds(n)
    f = (620, 900) if up else (430, 250)
    fr = f[0] * (f[1] / f[0]) ** np.clip(t / 0.05, 0, 1)
    y = 0.6 * np.sin(TWO_PI * phase(fr)) * np.exp(-t / (0.022 if up else 0.03))
    y += 0.25 * bp(noise(n, ('drag', key)), 1500, 6000) * np.exp(-t / 0.0015)
    return tail_fade(y * _onset(n, 0.3), 0.01)


def toggle(m, key):
    n = S(0.25)
    t = seconds(n)
    ph = TWO_PI * float(mtof(m)) * t
    y = np.sin(ph + 1.2 * np.exp(-t / 0.012) * np.sin(2.4 * ph)) * np.exp(-t / 0.045)
    return tail_fade(y * _onset(n, 0.2), 0.01)


# ---------------------------------------------------------------- tuning and placement


class Tuner:
    """Pitches ticks to the harmony: on a motif note, two octaves above it; otherwise runs of
    ticks (gaps <= 1.1 s) climb through the current chord's tones."""

    def __init__(self, sc):
        self.sc = sc
        self.anchor = {round(t, 3): m for t, _, m, _ in sc.parts['motif'] + sc.parts['flourish']}

    def tones(self, t, lo, hi):
        b = min(int(t // 2), self.sc.nbars - 1)
        pcs = self.sc.chords[b]['tones']
        return [m for m in range(lo, hi + 1) if m % 12 in pcs]

    def ticks(self, times):
        out = {}
        runs, cur = [], []
        for t in sorted(times):
            if cur and t - cur[-1] > 1.1:
                runs.append(cur)
                cur = []
            cur.append(t)
        if cur:
            runs.append(cur)
        final = [at(b) for b in self.sc.sec['final']]
        for run in runs:
            prev = None
            for i, t in enumerate(run):
                a = self.anchor.get(round(t, 3))
                lo, hi = FINAL_TICKS if final[0] <= t < final[1] else (72, 100)
                if a is not None:
                    m = a + 24 if a < 72 else a + 12
                elif prev is None:
                    goal = max(lo, 88 - 2 * max(len(run) - 3, 0))
                    m = min(self.tones(t, lo, hi), key=lambda p: abs(p - goal))
                else:
                    up = [p for p in self.tones(t, lo, hi + 3) if p > prev]
                    m = up[0] if up else prev
                out[t] = m
                prev = m
        return out

    def toggle_pitch(self, t):
        return min(self.tones(t, 90, 102), key=lambda p: abs(p - 96))


def load_events(tl):
    if EVENTS.exists():
        data = json.loads(EVENTS.read_text())
        evs = data.get('events', []) if isinstance(data, dict) else data
        src = str(EVENTS)
        if not any(e.get('kind') in CUE_KINDS for e in evs):
            evs = list(evs) + list(tl['CUES'])
            src += ' + timeline cues'
    else:
        evs, src = list(tl['CUES']), 'timeline cues (no build/events.json yet)'
    known = CUE_KINDS | UI_KINDS
    unknown = sorted({e.get('kind') for e in evs} - known)
    if unknown:
        print(f'sfx: ignoring unknown event kinds {unknown}')
    evs = sorted((e for e in evs if e.get('kind') in known), key=lambda e: e['t'])
    return ui_filter(merge_cues(evs)), src


def merge_cues(evs):
    """Cue sounds of one kind within 50 ms are one sound (a scene event doubling a timeline cue):
    the strongest wins, keeping any `to`/`peak` either carries."""
    out = []
    for e in evs:
        twin = next((o for o in reversed(out[-8:]) if o['kind'] == e['kind'] and e['kind'] in CUE_KINDS
                     and abs(o['t'] - e['t']) < 0.05), None)
        if twin is None:
            out.append(dict(e))
            continue
        if float(e.get('strength', 1) or 1) > float(twin.get('strength', 1) or 1):
            twin.update({k: e[k] for k in ('t', 'strength') if k in e})
        for k in ('to', 'peak'):
            if k in e and k not in twin:
                twin[k] = e[k]
    return out


def ui_filter(evs):
    """Thins the UI layer (see MERGE_S, KEY_GAP_S, UNDER_CUE_S, SCENE_UI); returns (kept, drop counts)."""
    cues = [e['t'] for e in evs if e['kind'] in ('tick', 'hit')]
    out, dropped = [], Counter()
    last_ui = last_key = -1e9
    for e in evs:
        kind, t = e['kind'], e['t']
        if kind not in UI_KINDS:
            out.append(e)
            continue
        keep = SCENE_UI.get(e.get('scene'))
        label = e.get('label')
        if keep and not keep(e):
            why = f"scene {e.get('scene')}"
        elif kind == 'key' and not (isinstance(label, str) and len(label) == 1 and label.isprintable()):
            why = 'key without a character'
        elif t - last_ui < MERGE_S:
            why = 'merged into the previous'
        elif kind == 'key' and t - last_key < KEY_GAP_S:
            why = 'key rate'
        elif any(abs(t - c) < UNDER_CUE_S for c in cues):
            why = 'under a cue'
        else:
            out.append(e)
            last_ui = t
            last_key = t if kind == 'key' else last_key
            continue
        dropped[why] += 1
    return out, dict(dropped)


def music_reference(x):
    segs = np.concatenate([x[S(at(a)):S(at(b))] for a, b in DENSE_BARS])
    return lufs_window(segs)


def local_loudness(x, t, half=1.5):
    return lufs_window(x[max(S(t - half), 0):S(t + half)])


def sub_root(sc, t, strength):
    """Hz a hit's boom settles on: the bar's bass root in D1..C#2, or D1 with no bass (or big)."""
    playing = any(n[0] <= t + 0.05 and t < n[0] + n[1] + 0.3 for n in sc.parts['bass'])
    if strength >= 0.99 or not playing:
        return 36.7
    return float(mtof(26 + (sc.root(min(int(t // 2), sc.nbars - 1)) - 26) % 12))


def burst_loudness(y):
    return float(np.max(loudness_curve(y, 0.1, 0.01)[1]))


def render_event(e, i, tuner, tick_pitch, sc):
    kind, s = e['kind'], float(e.get('strength', 1.0) or 1.0)
    key = (kind, i, round(e['t'], 4))
    if kind == 'hit':
        return hit(s, key, sub_root(sc, e['t'], s))
    if kind == 'whoosh':
        off, y = whoosh(s, key)
        return off + S(whoosh_peak(e) - WHOOSH_PEAK) - S(e['t']), y
    if kind == 'riser':
        return riser(float(e['to']) - e['t'], s, key)
    if kind == 'swell':
        b = min(int(e['t'] // 2), sc.nbars - 1)
        return swell(s, key, [p + 12 for p in sc.voicing[b]])
    if kind == 'tick':
        return tick(tick_pitch[e['t']], s, key)
    if kind == 'click':
        y = click(key)
    elif kind == 'key':
        y = key_tap(key)
    elif kind in ('drag-start', 'drag-end'):
        y = drag(key, kind == 'drag-start')
    elif kind == 'toggle':
        y = toggle(tuner.toggle_pitch(e['t']), key)
    else:
        return None
    st = pan(y, float(np.clip(e.get('pan', 0.0) or 0.0, -1, 1)) * 0.5)
    return 0, with_verb(st, y, 'room', 0.2)


def whoosh_peak(e):
    return float(e.get('peak') or e['t'] + WHOOSH_PEAK)


def band_snr(y, start, music, e, midi=None):
    """dB of a placed sound over the music in the sound's band and window: +-1/3 octave around a
    tick's pitch over its first 60 ms; 0.5-4 kHz around a whoosh's peak."""
    if e['kind'] == 'tick':
        f = float(mtof(midi))
        lo, hi, a, b = f / 2 ** (1 / 6), min(f * 2 ** (1 / 6), 20000.0), e['t'], e['t'] + 0.06
    else:
        p = whoosh_peak(e)
        lo, hi, a, b = 500.0, 4000.0, p - 0.15, p + 0.1
    pad, i0, i1 = S(0.2), S(a), S(b)
    ys = np.zeros((i1 - i0 + 2 * pad, 2))
    add_at(ys, y, start - (i0 - pad))
    ms = music[max(i0 - pad, 0):i1 + pad]
    fy = bp(ys.mean(axis=1), lo, hi, 4)[pad:pad + i1 - i0]
    fm = bp(ms.mean(axis=1), lo, hi, 4)[-(pad + i1 - i0):-pad]
    rms = lambda v: np.sqrt(np.mean(v ** 2)) + 1e-12
    return float(20 * np.log10(rms(fy) / rms(fm)))


def run():
    from .common import timeline
    tl = timeline()
    n = nsamples()
    sc = Score()
    (evs, dropped), src = load_events(tl)
    tuner = Tuner(sc)
    tick_pitch = tuner.ticks([e['t'] for e in evs if e['kind'] == 'tick'])
    music = read_wav(AUDIO / 'music.wav')
    ref = music_reference(music)
    out = np.zeros((n, 2))
    log = []
    for i, e in enumerate(evs):
        r = render_event(e, i, tuner, tick_pitch, sc)
        if r is None:
            continue
        off, y = r
        kind = e['kind']
        s = float(e.get('strength', 1.0) or 1.0)
        base = ref
        if kind in LOCAL_LEVEL:
            base = max(ref, local_loudness(music, whoosh_peak(e) if kind == 'whoosh' else e['t']))
        target = base + LEVEL[kind] + (12 * np.log10(max(s, 0.05) / REF_STRENGTH[kind]) if kind in REF_STRENGTH else 0.0)
        g = target - burst_loudness(y)
        start = S(e['t']) + off
        lift = 0.0
        if kind in UNMASK:
            snr = band_snr(y * db(g), start, music, e, tick_pitch.get(e['t']))
            lift = float(np.clip(UNMASK[kind]['floor'] - snr, 0.0, UNMASK[kind]['most']))
            g += lift
        add_at(out, y * db(g), start)
        log.append({'t': e['t'], 'kind': kind, 'strength': s, 'target_lufs_100ms': round(target, 2),
                    'gain_db': round(float(g), 2), **({'unmask_db': round(lift, 1)} if kind in UNMASK else {}),
                    **({'midi': tick_pitch[e['t']]} if kind == 'tick' else {}),
                    **({'peak': round(whoosh_peak(e), 3)} if kind == 'whoosh' else {}),
                    **({'scene': e['scene']} if e.get('scene') else {})})
    out = gate_breaths(mono_low(out), sc.breaths)  # the breath is silence in the sfx too
    out[-S(0.005):] *= (1 - cosramp(S(0.005)))[:, None]
    write_wav(AUDIO / 'sfx.wav', out)
    # The hashes let the report and render.mjs refuse a score built from other events.
    (AUDIO / 'sfx-events.json').write_text(json.dumps({
        'source': src, 'source_sha256': file_sha256(EVENTS), 'timeline_sha256': timeline_sha256(),
        'music_ref_lufs': round(ref, 2), 'ui_dropped': dropped, 'events': log}, indent=1))
    print(f'sfx: {len(log)} events from {src}; UI dropped {dropped}; music reference {ref:.1f} LUFS')
    kit()


def kit():
    """audio/sfx-kit.wav: one of each sound, 1 s apart, for auditioning (not used by the film)."""
    items = [('tick', 88), ('toggle', 96), ('click', None), ('key', None), ('drag-start', None),
             ('drag-end', None), ('whoosh', None), ('hit', 0.45), ('hit', 1.0)]
    out = np.zeros((S(len(items) * 1.2 + 6), 2))
    for i, (kind, arg) in enumerate(items):
        t = S(0.6 + 1.2 * i)
        key = ('kit', i)
        if kind == 'tick':
            off, y = tick(arg, 0.5, key)
        elif kind == 'hit':
            off, y = hit(arg, key)
        elif kind == 'whoosh':
            off, y = whoosh(0.6, key)
        else:
            m = {'click': click(key), 'key': key_tap(key), 'drag-start': drag(key, True),
                 'drag-end': drag(key, False), 'toggle': toggle(arg or 96, key)}[kind]
            off, y = 0, pan(m, 0.0)
        g = -14 + LEVEL[kind] - burst_loudness(y)
        add_at(out, y * db(g), t + off)
    write_wav(AUDIO / 'sfx-kit.wav', out)
