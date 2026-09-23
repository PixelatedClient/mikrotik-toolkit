import { useState } from 'react';

const LAYERS = [
  { name: 'Application', unit: 'Data', color: 'bg-sky-500/20 border-sky-500/50' },
  { name: 'Transport', unit: 'Segment', color: 'bg-violet-500/20 border-violet-500/50' },
  { name: 'Network', unit: 'Packet', color: 'bg-amber-500/20 border-amber-500/50' },
  { name: 'Link', unit: 'Frame', color: 'bg-emerald-500/20 border-emerald-500/50' },
  { name: 'Physical', unit: 'Bits', color: 'bg-rose-500/20 border-rose-500/50' },
];

const toBits = (s: string) =>
  [...new TextEncoder().encode(s.slice(0, 4))].map((b) => b.toString(2).padStart(8, '0')).join(' ');

export default function PacketJourney() {
  const [text, setText] = useState('GET /video');
  const [layer, setLayer] = useState(1);
  const [hop, setHop] = useState(false);

  // Fields change at a router: Ethernet addresses are rewritten and TTL drops. IP addresses stay.
  const headers: Record<number, [string, string][]> = {
    2: [['Source port', '51512 (random)'], ['Destination port', '443 (HTTPS)'], ['Flags', 'SYN, ACK'], ['Sequence', '1052774']],
    3: [['Source IP', '192.168.1.10'], ['Destination IP', '142.250.190.14'], ['Protocol', '6 (TCP)'], ['TTL', hop ? '63 (was 64)' : '64']],
    4: [['Destination MAC', hop ? 'aa:bb:cc:00:00:02 (next router)' : 'aa:bb:cc:00:00:01 (your gateway)'], ['Source MAC', hop ? 'aa:bb:cc:00:00:01 (rewritten)' : '11:22:33:44:55:66 (your PC)'], ['EtherType', '0x0800 (IPv4)']],
  };
  const explain = [
    'Your application produces the data. Here, a request for a video.',
    'TCP adds a header with ports, so the far end knows which program gets it, plus numbers for ordering and reliability.',
    'IP adds source and destination addresses. This is what routers use to move the packet across networks.',
    'Ethernet adds MAC addresses for the next hop only, plus a trailer for error checking. The frame is rebuilt at every router.',
    'The frame becomes voltage, light or radio. These are the first bytes of your message as bits.',
  ];
  const shown = LAYERS.slice(0, layer);

  return (
    <div className="not-prose my-8 rounded-xl border border-line bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Follow a packet down the stack</p>
      <label htmlFor="msg" className="mt-3 block text-sm font-medium">Type a message to send</label>
      <input id="msg" value={text} maxLength={40} onChange={(e) => setText(e.target.value)}
        className="mt-1 w-full max-w-sm rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm text-fg focus:border-accent" />

      <div className="mt-4 flex items-center gap-3">
        <label htmlFor="layer" className="text-sm font-medium">Layer {layer}: {LAYERS[layer - 1].name}</label>
        <input id="layer" type="range" min={1} max={5} value={layer} onChange={(e) => setLayer(+e.target.value)} className="flex-1 accent-[var(--accent)]" />
      </div>

      <div className="mt-4 rounded-lg border border-line p-3" aria-label="Encapsulation diagram">
        {/* Build from the data outwards: each lower layer wraps everything above it. */}
        {shown.reduce<React.ReactNode>((inner, L, i) => {
          const fields = headers[i + 1];
          return (
            <div className={`rounded-md border p-2 ${L.color}`}>
              <p className="text-xs font-semibold">{L.unit} <span className="font-normal text-muted">({L.name})</span></p>
              {fields && (
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-xs">
                  {fields.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="font-mono">{v}</dd></div>))}
                </dl>
              )}
              {inner ?? <p className="mt-1 break-all rounded bg-bg px-2 py-1 font-mono text-xs">{layer === 5 ? toBits(text) + (text.length > 4 ? ' ...' : '') : text || '(empty)'}</p>}
            </div>
          );
        }, null)}
      </div>

      <p role="status" aria-live="polite" className="mt-3 text-sm">{explain[layer - 1]}</p>

      {layer >= 3 && layer <= 4 && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hop} onChange={(e) => setHop(e.target.checked)} />
          Cross one router: what changes?
        </label>
      )}
      {hop && layer >= 3 && (
        <p className="mt-2 rounded-md bg-accent-soft p-2 text-xs">
          At the router the Ethernet header is thrown away and rebuilt with new MAC addresses, and the IP TTL drops by 1. The IP addresses and the data never change.
        </p>
      )}
    </div>
  );
}
