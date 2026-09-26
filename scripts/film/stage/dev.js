// Dev scrubber, loaded only with ?ui (never in renders): a timeline slider, play/pause
// (plays as fast as frames render), ←/→ step one frame, ?t= opens at a time.
const film = window.film;
const q = new URLSearchParams(location.search);
const bar = document.createElement('div');
bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;align-items:center;padding:8px 12px;background:#111d;color:#eee;font:12px -apple-system,system-ui;z-index:9';
bar.innerHTML = '<button id=pp>▶</button><input id=sl type=range min=0 step=any style="flex:1"><span id=tc style="width:190px;font-variant-numeric:tabular-nums"></span>';
document.body.appendChild(bar);
const [pp, sl, tc] = ['pp', 'sl', 'tc'].map((id) => bar.querySelector(`#${id}`));
sl.max = film.duration;
let t = Number(q.get('t') ?? 0), playing = false, busy = false;

async function show(x) {
  t = Math.min(film.duration - 1 / film.fps, Math.max(0, Math.round(x * film.fps) / film.fps));
  sl.value = t;
  tc.textContent = `${t.toFixed(3)} s · ${film.scenesAt(t).join(' → ')}`;
  busy = true;
  await film.seek(t);
  busy = false;
}
async function loop() {
  while (playing) await show(t + 1 / film.fps >= film.duration ? 0 : t + 1 / film.fps);
}
pp.onclick = () => {
  playing = !playing;
  pp.textContent = playing ? '❚❚' : '▶';
  if (playing) loop();
};
sl.oninput = () => !busy && show(Number(sl.value));
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') show(t + 1 / film.fps);
  if (e.key === 'ArrowLeft') show(t - 1 / film.fps);
  if (e.key === ' ') pp.onclick();
});
const stage = document.getElementById('stage');
const fit = () => {
  const k = Math.min(innerWidth / film.size.w, (innerHeight - 44) / film.size.h, 1);
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `scale(${k})`;
};
addEventListener('resize', fit);
fit();
await film.ready();
show(t);
