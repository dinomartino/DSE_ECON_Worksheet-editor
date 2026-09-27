"""Verification of the mastered score: loudness and true peak (ffmpeg ebur128), a spectrogram,
per-section energy against the timeline's energy map, cue onsets (sample-accurate hits),
the pre-drop breath, clipping, DC and mono compatibility. Writes audio/report.{json,txt}."""
import json
import re
import subprocess

import numpy as np
from scipy import signal
from scipy.stats import spearmanr

from .common import AUDIO, EVENTS, SR, STEMS, S, file_sha256, read_wav, timeline, timeline_sha256
from .dsp import hp, integrated_lufs, lp, lufs_window, todb, true_peak

TRANSIENT = ('hit', 'tick', 'drop')
LUFS_TARGET, LUFS_TOL, TP_MAX = -16.0, 0.5, -1.0
ONSET_TOL_MS = 5.0
BREATH_MAX_DBFS = -60.0
BIG_HIT, HIT_CONTRAST_DB = 0.85, 8.0  # a big hit is this much louder than its run-up


def freshness():
    """Whether music.wav was built from this timeline, and sfx.wav from the current events.json
    (a stale sfx pass once put every key tap 0.55 s late)."""
    def read(name):
        try:
            return json.loads((AUDIO / name).read_text())
        except (OSError, ValueError):
            return {}
    tl, ev = timeline_sha256(), file_sha256(EVENTS)
    m, s = read('music-levels.json'), read('sfx-events.json')
    return {'timeline_sha256': tl, 'events_sha256': ev, 'music': m.get('timeline_sha256') == tl,
            'sfx': s.get('timeline_sha256') == tl and s.get('source_sha256') == ev}


def hit_contrast(x, t):
    """dB of the 80 ms after t over the 50-250 ms before it (the run-up)."""
    a = np.sqrt(np.mean(x[S(t):S(t + 0.08)] ** 2))
    b = np.sqrt(np.mean(x[S(t - 0.25):S(t - 0.05)] ** 2))
    return float(todb(a) - todb(b))


def ebur128(path):
    """Integrated loudness, LRA and true peak as measured by ffmpeg's ebur128 filter."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af',
                        'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'],
                       capture_output=True, text=True, check=True)
    txt = r.stderr[r.stderr.rfind('Summary:'):]
    grab = lambda k: float(re.search(rf'{k}:\s+(-?[\d.]+|-inf)', txt).group(1))
    return {'I': grab('I'), 'LRA': grab('LRA'), 'TP': grab('Peak')}


def _band_onsets(m, rise_db, floor_db):
    h = 24  # 0.5 ms frames
    env = m[: len(m) // h * h].reshape(-1, h).max(axis=1)
    le = 20 * np.log10(env + 1e-12)
    base = np.full_like(le, -240.0)
    for k in range(10, 41):  # loudest level 5-20 ms earlier
        base[k:] = np.maximum(base[k:], le[:-k])
    hot = (le - base > rise_db) & (le > floor_db)
    out = []
    for i in np.flatnonzero(hot & ~np.concatenate([[False], hot[:-1]])):
        a = max(i * h - h, 0)
        seg = m[a:i * h + 2 * h]
        out.append((a + int(np.argmax(seg >= 0.1 * seg.max()))) / SR)
    return out


def onsets(x, rise_db=10.0, floor_db=-90.0, bands=(None, -150.0, 1500.0, 5000.0)):
    """Onset detector with no knowledge of the cues: a rise of `rise_db` in a 0.5 ms peak
    envelope over the loudest level 5-20 ms earlier, in the full band, below 150 Hz (an impact
    under a riser) and above 1.5 / 5 kHz (a tick over a dark tail). Onsets within 15 ms merge
    to the earliest. A negative band is a low-pass at |f|."""
    found = []
    for f in bands:
        y = x if f is None else hp(x, f, 4) if f > 0 else lp(x, -f, 4)
        m = np.abs(y).max(axis=1) if y.ndim == 2 else np.abs(y)
        found += _band_onsets(m, rise_db, floor_db)
    found.sort()
    out = []
    for t in found:
        if not out or t - out[-1] > 0.015:
            out.append(t)
    return np.array(out)


def master_lag(score, pre, t0=28.0, t1=36.0):
    """Samples by which the master is shifted against music + sfx (0 = timing preserved)."""
    a, b = S(t0), S(t1)
    c = signal.correlate(score[a:b].mean(axis=1), pre[a:b].mean(axis=1), mode='full', method='fft')
    return int(np.argmax(c) - (b - a - 1))


def full_breaths(tl):
    """(start, end) of each full breath: a strength-1 `breath` cue up to the next `drop`."""
    cues = tl['CUES']
    return [(c['t'], min(d['t'] for d in cues if d['kind'] == 'drop' and d['t'] > c['t']))
            for c in cues if c['kind'] == 'breath' and c['strength'] >= 0.99]


def match(cues, found):
    rows = []
    for c in cues:
        if len(found) == 0:
            rows.append({**c, 'onset': None, 'err_ms': None})
            continue
        k = int(np.argmin(np.abs(found - c['t'])))
        rows.append({**c, 'onset': round(float(found[k]), 5), 'err_ms': round(float(found[k] - c['t']) * 1000, 2)})
    return rows


def sections_table(x, tl):
    rows = []
    for s in tl['SECTIONS']:
        a, b = S(s['from'] * 2.0), S(s['to'] * 2.0)
        seg = x[a:b]
        rms = np.sqrt(np.mean(seg ** 2))
        rows.append({'id': s['id'], 'bars': f"{s['from']}-{s['to']}", 'energy': s['energy'],
                     'lufs': round(float(lufs_window(seg)), 2), 'rms_dbfs': round(float(todb(rms)), 2),
                     'peak_dbfs': round(float(todb(np.max(np.abs(seg)))), 2)})
    e = [r['energy'] for r in rows]
    l = [r['lufs'] for r in rows]
    rho = spearmanr(e, l).statistic
    # the loudness each section "should" have if loudness tracked 20*log10(energy) linearly
    fit = np.polyfit(20 * np.log10(e), l, 1)
    for r in rows:
        r['fit_lufs'] = round(float(np.polyval(fit, 20 * np.log10(r['energy']))), 2)
    return rows, float(rho), [float(v) for v in fit]


def mono_check(x, tl):
    L, R = x[:, 0], x[:, 1]
    corr = float(np.corrcoef(L, R)[0, 1])
    mono = np.stack([(L + R) / 2] * 2, axis=1)
    fold = float(integrated_lufs(mono) - integrated_lufs(x))
    lowm = lp(0.5 * (L + R), 120, 4)
    lows = lp(0.5 * (L - R), 120, 4)
    side_low = float(todb(np.sqrt(np.mean(lows ** 2))) - todb(np.sqrt(np.mean(lowm ** 2))))
    per = {}
    for s in tl['SECTIONS']:
        a, b = S(s['from'] * 2.0), S(s['to'] * 2.0)
        per[s['id']] = round(float(np.corrcoef(L[a:b], R[a:b])[0, 1]), 3)
    return {'lr_correlation': round(corr, 3), 'per_section_correlation': per,
            'mono_folddown_lu': round(fold, 2), 'side_below_120hz_db': round(side_low, 1)}


def spectrogram(x, tl, path, title):
    from .plot import render
    render(x, tl, path, title, full_breaths(tl))


def run():
    tl = timeline()
    score = read_wav(AUDIO / 'score.wav')
    sfx = read_wav(AUDIO / 'sfx.wav')
    dur = float(tl['DURATION'])
    rep = {'file': str(AUDIO / 'score.wav'), 'duration_s': len(score) / SR, 'expected_s': dur}
    checks = {}
    rep['freshness'] = freshness()
    checks['music_matches_timeline'] = rep['freshness']['music']
    checks['sfx_matches_events'] = rep['freshness']['sfx']

    ff = ebur128(AUDIO / 'score.wav')
    rep['loudness'] = {**ff, 'I_python': round(float(integrated_lufs(score)), 2),
                       'TP_python_4x': round(float(todb(true_peak(score))), 2)}
    checks['duration'] = abs(len(score) / SR - dur) < 1 / SR
    checks['integrated'] = abs(ff['I'] - LUFS_TARGET) <= LUFS_TOL
    checks['true_peak'] = ff['TP'] <= TP_MAX

    peak = float(np.max(np.abs(score)))
    rep['sample_peak_dbfs'] = round(float(todb(peak)), 2)
    rep['clipped_samples'] = int(np.sum(np.abs(score) >= 0.999))
    rep['dc_offset'] = [float(f'{v:.2e}') for v in score.mean(axis=0)]
    checks['no_clipping'] = rep['clipped_samples'] == 0 and peak < 1.0
    checks['no_dc'] = max(abs(v) for v in rep['dc_offset']) < 1e-4

    rows, rho, fit = sections_table(score, tl)
    rep['sections'] = rows
    rep['energy_loudness_spearman'] = round(rho, 3)
    rep['energy_fit_lufs_per_db'] = round(fit[0], 3)
    checks['energy_map'] = rho >= 0.9

    rep['breaths'] = []
    for a, b in full_breaths(tl):
        seg = score[S(a) + 24:S(b) - 24]
        rms = float(todb(np.sqrt(np.mean(seg ** 2))))
        mx = float(todb(np.max(np.abs(seg))))
        rep['breaths'].append({'from': a, 'to': b, 'rms_dbfs': round(rms, 1), 'peak_dbfs': round(mx, 1)})
        checks[f'breath_{a}'] = mx <= BREATH_MAX_DBFS

    # Cue timing, proven where each sound is isolated: the sfx stem (every hit and tick), the
    # drums stem (the band's downbeat on every hit/drop once drums play), the lead stem (the
    # motif on the first three cues). The master adds no delay (lag 0), so the mix inherits it.
    # Full-mix onsets are listed for information: builds (riser, snare roll) mask some rises.
    cues = [dict(t=c['t'], kind=c['kind'], note=c.get('note', '')) for c in tl['CUES'] if c['kind'] in TRANSIENT]
    drums = read_wav(STEMS / 'drums.wav')
    first_drum = np.flatnonzero(np.abs(drums).max(axis=1) > 1e-4)[0] / SR
    band = [c for c in cues if c['kind'] in ('hit', 'drop') and c['t'] >= first_drum - 0.001]
    rep['onsets'] = {
        'sfx stem (hits, ticks)': match([c for c in cues if c['kind'] != 'drop'], onsets(sfx)),
        'drums stem (hits, drops)': match(band, onsets(drums, rise_db=6.0)),
        'lead stem (motif)': match([c for c in cues if c['kind'] != 'drop'][:3], onsets(read_wav(STEMS / 'lead.wav'))),
        'full mix (information only: builds mask some rises)': match([c for c in cues if c['kind'] in ('hit', 'drop')], onsets(score, rise_db=6.0)),
    }
    for name, rows in rep['onsets'].items():
        if 'information' not in name:
            key = 'onsets_' + name.split()[0]
            checks[key] = all(r['err_ms'] is not None and abs(r['err_ms']) <= ONSET_TOL_MS for r in rows)
    big = [c for c in tl['CUES'] if c['kind'] == 'hit' and c['strength'] >= BIG_HIT]
    rep['hit_contrast_db'] = {f"{c['t']:.2f}": round(hit_contrast(score, c['t']), 1) for c in big}
    checks['hit_contrast'] = all(v >= HIT_CONTRAST_DB for v in rep['hit_contrast_db'].values())
    rep['master_lag_samples'] = master_lag(score, read_wav(AUDIO / 'music.wav') + sfx)
    checks['master_timing'] = rep['master_lag_samples'] == 0

    rep['mono'] = mono_check(score, tl)
    checks['mono_low_end'] = rep['mono']['side_below_120hz_db'] < -30
    checks['mono_folddown'] = rep['mono']['mono_folddown_lu'] > -2.0

    tail = score[-S(0.1):]
    rep['tail_last_100ms_dbfs'] = round(float(todb(np.sqrt(np.mean(tail ** 2)))), 1)
    rep['last_sample'] = float(np.max(np.abs(score[-1])))
    checks['silent_end'] = rep['last_sample'] == 0.0 and rep['tail_last_100ms_dbfs'] < -70

    rep['checks'] = checks
    rep['pass'] = all(checks.values())
    spectrogram(score, tl, AUDIO / 'spectrogram.png',
                f"Econ Worksheet film score — {ff['I']:.1f} LUFS, {ff['TP']:.1f} dBTP, {dur:.0f} s")
    (AUDIO / 'report.json').write_text(json.dumps(rep, indent=1))
    (AUDIO / 'report.txt').write_text(render_text(rep))
    print(render_text(rep))
    return rep['pass']


def render_text(rep):
    L = rep['loudness']
    out = [f"score.wav  {rep['duration_s']:.3f} s  (timeline {rep['expected_s']:.3f} s)",
           f"loudness   I {L['I']:.1f} LUFS (python {L['I_python']:.1f})  LRA {L['LRA']:.1f} LU  "
           f"true peak {L['TP']:.1f} dBTP (python 4x {L['TP_python_4x']:.2f})  "
           f"sample peak {rep['sample_peak_dbfs']:.2f} dBFS",
           f"clipping   {rep['clipped_samples']} samples  DC {rep['dc_offset']}",
           '', 'section      bars   energy   LUFS   fit    RMS dBFS  peak dBFS']
    for r in rep['sections']:
        out.append(f"{r['id']:<12} {r['bars']:<6} {r['energy']:>5.2f}  {r['lufs']:>6.1f} {r['fit_lufs']:>6.1f}"
                   f"  {r['rms_dbfs']:>8.1f}  {r['peak_dbfs']:>8.1f}")
    out.append(f"energy vs loudness: Spearman {rep['energy_loudness_spearman']:.3f}, "
               f"{rep['energy_fit_lufs_per_db']:.2f} LU per dB of energy")
    out.append('')
    for b in rep['breaths']:
        out.append(f"breath {b['from']:.2f}-{b['to']:.2f} s: RMS {b['rms_dbfs']:.1f} dBFS, peak {b['peak_dbfs']:.1f} dBFS")
    out.append('')
    out.append(f"cue onsets (detected with no knowledge of the cues; tolerance {ONSET_TOL_MS} ms); "
               f"master vs music+sfx lag {rep['master_lag_samples']} samples")
    for name, rows in rep['onsets'].items():
        errs = [abs(r['err_ms']) for r in rows if r['err_ms'] is not None]
        out.append(f"  {name}: {len(rows)} cues, max |err| {max(errs) if errs else '-'} ms")
        for r in rows:
            out.append(f"    {r['kind']:<6} {r['note'][:22]:<22} {r['t']:>7.3f}  "
                       f"{r['onset'] if r['onset'] is not None else '-':>9}  {r['err_ms']:>8} ms")
    out.append(f"big hits over their run-up (>= {HIT_CONTRAST_DB} dB): "
               + ', '.join(f'{t} s {v:+.1f}' for t, v in rep['hit_contrast_db'].items()))
    f = rep['freshness']
    out.append(f"freshness  music from this timeline: {'yes' if f['music'] else 'NO'}; sfx from the current "
               f"events.json: {'yes' if f['sfx'] else 'NO'} (events {str(f['events_sha256'])[:12]})")
    m = rep['mono']
    out += ['', f"mono       L/R correlation {m['lr_correlation']}, fold-down {m['mono_folddown_lu']} LU, "
                f"side below 120 Hz {m['side_below_120hz_db']} dB rel. mid",
            f"           per section {m['per_section_correlation']}",
            f"tail       last 100 ms {rep['tail_last_100ms_dbfs']} dBFS, last sample {rep['last_sample']}",
            '', 'checks     ' + '  '.join(f"{k}={'ok' if v else 'FAIL'}" for k, v in rep['checks'].items()),
            f"RESULT     {'PASS' if rep['pass'] else 'FAIL'}"]
    return '\n'.join(out) + '\n'
