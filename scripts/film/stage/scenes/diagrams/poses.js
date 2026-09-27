// Camera poses as data: { target, dist, az, el, shift }. Poses blend by easing each field
// (distance in log space, so a dolly's image scale changes evenly), then lib.camera.orbit
// places the camera. Pure functions of their arguments.

const lerp = (a, b, u) => a + (b - a) * u;
const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

/** p → q at u (0..1). */
export function mix(p, q, u) {
  if (u <= 0) return p;
  if (u >= 1) return q;
  return {
    target: lerp3(p.target, q.target, u),
    dist: p.dist * Math.pow(q.dist / p.dist, u),
    az: lerp(p.az, q.az, u),
    el: lerp(p.el, q.el, u),
    shift: [lerp(p.shift[0], q.shift[0], u), lerp(p.shift[1], q.shift[1], u)],
  };
}

/** Chains moves: [[pose, u], …] applied in order onto `start`. */
export function chain(start, moves) {
  return moves.reduce((p, [q, u]) => mix(p, q, u), start);
}
