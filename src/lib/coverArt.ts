export type ArtKind = 'heat' | 'signal' | 'scatter' | 'dither';

export const ART_KINDS: ArtKind[] = ['heat', 'signal', 'scatter', 'dither'];
export const ART_INKS = ['#3ddc84', '#c792ea', '#5ac8fa', '#f5a524'];

export const rng = (str: string) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sq = (x: number, y: number, s: number) =>
  'M' + x + ' ' + y + 'h' + s + 'v' + s + 'h-' + s + 'z';

const dot = (x: number, y: number, r: number) => {
  const rr = +r.toFixed(1);
  return (
    'M' + (x - rr).toFixed(1) + ' ' + y.toFixed(1) +
    'a' + rr + ' ' + rr + ' 0 1 0 ' + 2 * rr + ' 0' +
    'a' + rr + ' ' + rr + ' 0 1 0 -' + 2 * rr + ' 0'
  );
};

// Fallback when a post has no artKind / artInk in its frontmatter.
export function pickArt(title: string): { kind: ArtKind; ink: string } {
  const r = rng('pick:' + title);
  return {
    kind: ART_KINDS[Math.floor(r() * ART_KINDS.length)],
    ink: ART_INKS[Math.floor(r() * ART_INKS.length)],
  };
}

export function art(title: string, kind: ArtKind, ink: string) {
  const r = rng(title);
  let p1 = '', p2 = '', p3 = '', line = '', lineColor = ink;

  if (kind === 'heat') {
    for (let i = 0; i < 20; i++)
      for (let j = 0; j < 12; j++) {
        const v = r() * 0.65 + ((i + j) / 32) * 0.45;
        const s = sq(i * 20 + 2, j * 20 + 2, 16);
        if (v > 0.95) p3 += s;
        else if (v > 0.65) p2 += s;
        else if (v > 0.35) p1 += s;
      }
  } else if (kind === 'signal') {
    for (let x = 0; x <= 400; x += 40)
      for (let y = 20; y < 240; y += 40) p1 += dot(x, y, 1.6);
    const f1 = 0.015 + r() * 0.02, f2 = 0.04 + r() * 0.04;
    const q1 = r() * 6, q2 = r() * 6;
    const pts: [number, number][] = [];
    for (let x = 0; x <= 400; x += 5)
      pts.push([x, 125 + Math.sin(x * f1 + q1) * 45 + Math.sin(x * f2 + q2) * 18 + (r() - 0.5) * 10]);
    line = 'M' + pts.map((p) => p[0] + ' ' + p[1].toFixed(1)).join('L');
    for (let i = 0; i < pts.length; i += 4) p2 += dot(pts[i][0], pts[i][1] + 24, 2.2);
    for (let k = 0; k < 3; k++) {
      const p = pts[8 + Math.floor(r() * 64)];
      p3 += dot(p[0], p[1], 5.5);
    }
  } else if (kind === 'scatter') {
    const m = 0.25 + r() * 0.25, b = 215 - r() * 20;
    line = 'M0 ' + b.toFixed(1) + 'L400 ' + (b - m * 400).toFixed(1);
    lineColor = '#e6e9ef';
    for (let i = 0; i < 56; i++) {
      const x = 14 + r() * 372;
      const y = Math.min(228, Math.max(12, b - m * x + (r() - 0.5) * 80));
      const rad = 3 + r() * 4;
      const d = dot(x, y, rad);
      if (rad < 4.5) p1 += d;
      else if (rad < 6) p2 += d;
      else p3 += d;
    }
  } else {
    for (let i = 0; i < 50; i++)
      for (let j = 0; j < 30; j++) {
        const v = 1 - (i / 50 + j / 30) / 2 + (r() - 0.5) * 0.6;
        const s = sq(i * 8 + 1, j * 8 + 1, 6);
        if (v > 0.62) p3 += s;
        else if (v > 0.42) p2 += s;
        else if (v > 0.28) p1 += s;
      }
  }
  return { p1, p2, p3, line, lineColor };
}