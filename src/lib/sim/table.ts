/**
 * Table output in the layout RouterOS 7 uses for `print`.
 *
 * Learned from real 7.16 output:
 *  - a `Flags:` legend lists only the flags that appear, grouped as `D - DYNAMIC; X - DISABLED, I - INACTIVE, A - ACTIVE; c - CONNECT, s - STATIC`
 *  - an index column `#` exists only when some row is numbered (dynamic rows have no number)
 *  - flags sit in a fixed slot: a dynamic `D` first, then the remaining flags
 *  - columns are separated by two spaces, numbers are right aligned, comments print above their row as `;;; text`
 */

export interface Col {
  title: string;
  align?: 'left' | 'right';
}

export interface Row {
  /** Shown index, or null for rows that have none (dynamic entries). */
  index: number | null;
  /** e.g. "D", "X", "DAc". */
  flags: string;
  cells: string[];
  comment?: string;
}

export interface FlagDef {
  letter: string;
  name: string;
  /** Legend group: letters of one group are joined with ", ", groups with "; ". */
  group: number;
}

export const BARE = String.fromCharCode(0);

const pad = (s: string, w: number, right = false) => (right ? s.padStart(w) : s.padEnd(w));

export function legend(defs: FlagDef[], rows: Row[]): string {
  const present = new Set(rows.flatMap((r) => r.flags.split('')));
  const groups = new Map<number, string[]>();
  for (const d of defs) {
    if (!present.has(d.letter)) continue;
    groups.set(d.group, [...(groups.get(d.group) ?? []), `${d.letter} - ${d.name}`]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.join(', ')).join('; ');
}

export function renderTable(cols: Col[], rows: Row[], defs: FlagDef[]): string {
  const lines: string[] = [];
  const leg = legend(defs, rows);
  if (leg) lines.push(`Flags: ${leg}`);
  lines.push(`Columns: ${cols.map((c) => c.title).join(', ')}`);

  const hasIndex = rows.some((r) => r.index !== null);
  const idxW = hasIndex ? Math.max(1, ...rows.map((r) => (r.index === null ? 0 : String(r.index).length))) : 0;
  const hasD = rows.some((r) => r.flags.includes('D'));
  const rest = (r: Row) => r.flags.replace('D', '');
  const restW = Math.max(0, ...rows.map((r) => rest(r).length));
  const flagW = (hasD ? 1 : 0) + restW;

  const widths = cols.map((c, i) => Math.max(c.title.length, ...rows.map((r) => (r.cells[i] ?? '').length)));

  const prefix = (idx: string, flags: string) => {
    const parts: string[] = [];
    if (hasIndex) parts.push(pad(idx, idxW));
    if (flagW > 0) parts.push(`${hasD ? (flags.includes('D') ? 'D' : ' ') : ''}${pad(flags.replace('D', ''), restW)}`);
    return parts.length ? parts.join(' ') + ' ' : '';
  };
  const cellLine = (cells: string[]) => cols.map((c, i) => pad(cells[i] ?? '', widths[i], c.align === 'right')).join('  ').replace(/\s+$/, '');

  lines.push(`${prefix('#', '')}${cols.map((c, i) => pad(c.title, widths[i], c.align === 'right')).join('  ')}`.replace(/\s+$/, ''));
  for (const r of rows) {
    if (r.comment) lines.push(`;;; ${r.comment}`);
    // a cell with several values (tagged ports, say) continues on the following lines, in its own column
    const split = r.cells.map((c) => c.split('\n'));
    const height = Math.max(1, ...split.map((s) => s.length));
    for (let k = 0; k < height; k++) {
      const cells = split.map((s) => s[k] ?? '');
      lines.push(k === 0 ? `${prefix(r.index === null ? '' : String(r.index), r.flags)}${cellLine(cells)}` : `${' '.repeat(prefix('', '').length)}${cellLine(cells)}`);
    }
  }
  return lines.join('\n');
}

/** `print terse` style: `2 comment=to R2 address=10.0.12.1/30 ...` */
export function renderTerse(rows: { index: number | null; flags: string; props: [string, string][] }[]): string {
  return rows
    .map((r) => {
      const head = [r.index === null ? '' : String(r.index), r.flags].filter(Boolean).join(' ');
      return `${head ? head + ' ' : ''}${r.props.map(([k, v]) => (v === BARE ? k : `${k}=${v}`)).join(' ')}`;
    })
    .join('\n');
}

/**
 * `print` for firewall style menus: one block per item, wrapped at 80 columns.
 * Layout from real output: ` 1 X  ;;; comment`, then the properties indented by 6, or on the first line when there is no comment.
 */
export function renderBlocks(legendText: string, blocks: { index: number | null; flags: string; comment?: string; props: [string, string][] }[], flagW = 2, noFlags = false): string {
  const lines: string[] = legendText.trim() ? legendText.split(String.fromCharCode(10)) : [];
  const iw = Math.max(2, ...blocks.map((b) => String(b.index ?? '').length));
  const indent = ' '.repeat(noFlags ? iw + 1 : iw + 2 + flagW);
  for (const b of blocks) {
    const idx = String(b.index ?? '').padStart(iw);
    const head = noFlags ? `${idx} ` : `${idx} ${b.flags.padEnd(flagW)} `;
    const out: string[] = [];
    let cur = head;
    if (b.comment) { out.push(`${head};;; ${b.comment}`); cur = indent; }
    for (const [k, v] of b.props) {
      const piece = v === BARE ? `${k} ` : `${k}=${v} `;
      if (cur.length + piece.length > 80 && cur !== head && cur !== indent) { out.push(cur); cur = indent; }
      cur += piece;
    }
    out.push(cur);
    lines.push(...out, '');
  }
  return lines.join('\n').replace(/\n+$/, '');
}
