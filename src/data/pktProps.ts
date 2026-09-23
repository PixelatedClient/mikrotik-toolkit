/**
 * Little pixel props Pkt carries in its scenes (landing page). Each prop is an ASCII bitmap:
 * one character per pixel, '.' is empty. `at` is where the prop sits relative to Pkt (in 8px world units),
 * measured from Pkt's top-left corner of the body (body is 16 wide and 8 tall).
 */
export const PALETTE: Record<string, string> = {
  y: '#ffd23f', Y: '#c99a12', w: '#ffffff', k: '#0a0e2a', r: '#ff5a5a', g: '#5cff8a', b: '#6aa8ff', o: '#ff9a3a',
  p: '#b78aff', s: '#cfd6ff', n: '#8a5a2b', c: '#5ce6ff', d: '#5a5f8a', G: '#2f8f4e',
};

export interface Prop {
  rows: string[];
  /** Offset of the bitmap's top-left from the top-left of Pkt's body, in world units. */
  at: [number, number];
}

export const PROPS: Record<string, Prop> = {
  wrench: { at: [17, -1], rows: ['.ss..s', 'ssss.s', '.ssssss', '..ss.ss', '..ss..', '..ss..', '.ss...'].map((r) => r.padEnd(7, '.')) },
  magnifier: { at: [17, -2], rows: ['.ccc..', 'c...c.', 'c...c.', 'c...c.', '.ccc..', '...nn.', '....nn'] },
  cable: { at: [16, 5], rows: ['bbbbbbbb', 'b......b', 'b......b', '.bbbbbb.'] },
  map: { at: [17, -3], rows: ['wwwwwww', 'wgwrwbw', 'wwrwwgw', 'wbwwrww', 'wwwwwww'] },
  laptop: { at: [17, 1], rows: ['.kkkkkk.', '.kcccck.', '.kcgcck.', '.kkkkkk.', 'ssssssss', 'sddddds.'.slice(0, 8)] },
  bulb: { at: [6, -8], rows: ['..yyy..', '.yyyyy.', '.yyyyy.', '..yyy..', '..sss..', '..sss..'] },
  question: { at: [6, -8], rows: ['.wwww.', 'w....w', '....w.', '...w..', '..w...', '......', '..w...'] },
  exclam: { at: [7, -8], rows: ['.rr.', '.rr.', '.rr.', '.rr.', '....', '.rr.'] },
  heart: { at: [6, -7], rows: ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'] },
  zzz: { at: [15, -4], rows: ['wwww.....', '..w......', '.w..www..', 'wwww..w..', '.....w...', '....www..'].map((r) => r.padEnd(9, '.')) },
  shield: { at: [6, -8], rows: ['bbbbbbb', 'bwwbwwb', 'bwwbwwb', 'bbbbbbb', '.bbbbb.', '..bbb..', '...b...'] },
  lock: { at: [7, -8], rows: ['..sss..', '.s...s.', '.s...s.', 'ooooooo', 'ooookoo', 'ooookoo', 'ooooooo'] },
  bug: { at: [17, 3], rows: ['.r.r.', '..rrr..'.slice(0, 5), 'rrrrrrr'.slice(0, 5), '.rrr.', 'r.r.r'] },
  wifi: { at: [6, -8], rows: ['.cccccc.', 'c......c', '..cccc..', '.c....c.', '...cc...', '........', '...cc...'] },
  package: { at: [17, 2], rows: ['nnnnnn', 'nYYYYn', 'nnnnnn', 'nYnnYn', 'nnnnnn'] },
  check: { at: [7, -8], rows: ['......g', '.....gg', 'g...gg.', 'gg.gg..', '.ggg...', '..g....'] },
  cross: { at: [7, -8], rows: ['r....r', '.r..r.', '..rr..', '..rr..', '.r..r.', 'r....r'] },
  binoculars: { at: [17, 0], rows: ['.dd.dd.', 'dddddddd'.slice(0, 7), 'dwd.dwd', 'ddd.ddd'] },
  compass: { at: [17, -1], rows: ['..sss..', '.sr.ws.', 'sr...ws', 's..k..s', 'sw...rs', '.sw.rs.', '..sss..'] },
  campfire: { at: [17, 1], rows: ['..r..', '.ror.', '.oyo.', 'roYor', 'nnnnn'] },
  sun: { at: [22, -9], rows: ['.o.o.o.', '..yyy..', 'oyyyyyo', '..yyy..', '.o.o.o.'] },
  gear: { at: [17, -2], rows: ['..s.s..', '.sssss.', 'ss.k.ss', '.sssss.', 'ss.k.ss', '.sssss.', '..s.s..'] },
  flag: { at: [17, -4], rows: ['nrrrr', 'nrrrr', 'nrrr.', 'n....', 'n....', 'n....', 'n....'] },
  disk: { at: [17, 1], rows: ['ssssss.', 'skkkks.', 'sswwss.', 'sswwss.', 'ssssss.'] },
  toggle: { at: [17, 3], rows: ['.dddddd.', 'dgggwwgd'.slice(0, 8), '.dddddd.'] },
  progress: { at: [17, 2], rows: ['wwwwwwwwww', 'wggggg...w', 'wwwwwwwwww'] },
  graph: { at: [17, -2], rows: ['w........', 'w......g.', 'w....g.g.', 'w..g.g...', 'wg.g.....', 'wwwwwwwww'] },
  power: { at: [7, -8], rows: ['..gg..', 'g.gg.g', 'g.gg.g', 'g....g', '.g..g.', '..gg..'] },
  star: { at: [6, -8], rows: ['...y...', '...y...', 'yyyyyyy', '.yyyyy.', '.yy.yy.', 'yy...yy'] },
  arrow: { at: [17, 3], rows: ['....r...', 'rrrrrr..', 'rrrrrrr.', 'rrrrrr..', '....r...'].map((r) => r.padEnd(8, '.')) },
  spark: { at: [16, 4], rows: ['.y...y.', '..y.y..', 'yyyyyyy', '..y.y..', '.y...y.'] },
  cone: { at: [17, 3], rows: ['..o..', '.owo.', '.ooo.', 'owwwo', 'ooooo'] },
  signpost: { at: [17, -2], rows: ['nnnnnnn', 'nwwwwwn', 'nnnnnnn', '..n....', '..n....', '..n....', '..n....', '..n....'] },
  router: { at: [17, 2], rows: ['..s..s..', 'yyyyyyyy', 'ykkkkkky'.slice(0, 8), 'yyyyyyyy', 'gy.gy.gy'.slice(0, 8)] },
  cloud: { at: [7, -8], rows: ['..sss...', '.sssss.s', 'ssssssss', '.ssssss.'] },
  antennaWave: { at: [8, -6], rows: ['c...c', '.c.c.', '..c..', '.c.c.', 'c...c'] },
  hammer: { at: [17, -2], rows: ['.ddd...', '.dddn..', '.ddd.n.', '.....n.', '......n'] },
  paper: { at: [17, 1], rows: ['wwwww', 'wkkkw', 'wwwww', 'wkkkw', 'wwwww', 'wkkkw'] },
  sparkle: { at: [8, -7], rows: ['..y..', '.yyy.', 'yywyy', '.yyy.', '..y..'] },
  backpack: { at: [-3, 2], rows: ['.rrr', 'rrrr', 'rYYr', 'rrrr', 'rrrr'] },
  puddle: { at: [18, 8], rows: ['.bbbbb.', 'bbwbbbb', '.bbbbb.'] },
  server: { at: [17, -2], rows: ['ddddddd', 'dgkkkkd', 'ddddddd', 'drkkkkd', 'ddddddd', 'dgkkkkd', 'ddddddd'] },
  globe: { at: [17, -2], rows: ['.bbbb.', 'bbGGbb', 'bGGbbb', 'bbGGGb', '.bbbb.'] },
};

/** Make every row of a prop the same width so the drawing code can rely on it. */
export function normalized(p: Prop): string[] {
  const w = Math.max(...p.rows.map((r) => r.length));
  return p.rows.map((r) => r.padEnd(w, '.'));
}

/** Turn a bitmap into rectangles, merging runs of the same colour on a row. */
export function toRects(p: Prop): { x: number; y: number; w: number; fill: string }[] {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  normalized(p).forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || !PALETTE[ch]) { x++; continue; }
      let e = x;
      while (e + 1 < row.length && row[e + 1] === ch) e++;
      out.push({ x: p.at[0] + x, y: p.at[1] + y, w: e - x + 1, fill: PALETTE[ch] });
      x = e + 1;
    }
  });
  return out;
}
