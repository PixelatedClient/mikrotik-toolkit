/**
 * A small interpreter for the RouterOS routing-filter script language used by `/routing filter rule`, just the subset
 * this site's lessons and labs use: `if (COND) { STMTS }`, bare `STMTS` (always run), `;`-separated statements,
 * `accept`/`reject`/`set <prop> <value>`, and conditions `dst == CIDR`, `dst in CIDR`, `dst-len > N`, `dst-len < N`,
 * `bgp-communities any C`, joined with `||`. The default action for a chain with no matching rule is reject.
 */
import { inNet, parseCidr, type Cidr } from './ip';

export interface FilterCtx {
  dst: Cidr;
  communities: string[];
  attrs: { localPref?: number; prepend: number; communities: string[] };
}

export type FilterVerdict = 'accept' | 'reject' | 'continue';

function evalCond(cond: string, ctx: FilterCtx): boolean {
  return cond.split('||').some((part) => {
    const c = part.trim();
    let m = /^dst\s*==\s*(\S+)$/.exec(c);
    if (m) { const n = parseCidr(m[1]); return !!n && n.net === ctx.dst.net && n.cidr === ctx.dst.cidr; }
    m = /^dst\s+in\s+(\S+)$/.exec(c);
    if (m) { const n = parseCidr(m[1]); return !!n && inNet(ctx.dst.ip, n); }
    m = /^dst-len\s*([<>]=?)\s*(\d+)$/.exec(c);
    if (m) {
      const v = Number(m[2]);
      if (m[1] === '>') return ctx.dst.cidr > v;
      if (m[1] === '<') return ctx.dst.cidr < v;
      if (m[1] === '>=') return ctx.dst.cidr >= v;
      return ctx.dst.cidr <= v;
    }
    m = /^bgp-communities\s+any\s+(\S+)$/.exec(c);
    if (m) return ctx.communities.includes(m[1]);
    return false;
  });
}

/** Split on `;` or `{`/`}` boundaries, respecting brace nesting so a `set` inside an `if` body is not cut apart. */
function splitStatements(src: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of src) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === ';' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function runOne(stmt: string, ctx: FilterCtx): FilterVerdict {
  const ifm = /^if\s*\((.*)\)\s*\{([\s\S]*)\}$/.exec(stmt);
  if (ifm) return evalCond(ifm[1], ctx) ? runBlock(ifm[2], ctx) : 'continue';
  if (stmt === 'accept') return 'accept';
  if (stmt === 'reject') return 'reject';
  const setm = /^set\s+(\S+)\s+(.+)$/.exec(stmt);
  if (setm) {
    const [, prop, value] = setm;
    if (prop === 'bgp-local-pref') ctx.attrs.localPref = Number(value);
    else if (prop === 'bgp-path-prepend') ctx.attrs.prepend += Number(value);
    else if (prop === 'bgp-communities') ctx.attrs.communities = value.split(',');
    return 'continue';
  }
  return 'continue';
}

function runBlock(src: string, ctx: FilterCtx): FilterVerdict {
  for (const stmt of splitStatements(src)) {
    const v = runOne(stmt, ctx);
    if (v !== 'continue') return v;
  }
  return 'continue';
}

/** Run every rule of a chain in order; the first accept/reject wins. No match at all means reject (the RouterOS default). */
export function runChain(rules: { chain: string; text: string; disabled: boolean }[], chain: string, ctx: FilterCtx): 'accept' | 'reject' {
  for (const r of rules) {
    if (r.disabled || r.chain !== chain) continue;
    const v = runBlock(r.text, ctx);
    if (v !== 'continue') return v;
  }
  return 'reject';
}
