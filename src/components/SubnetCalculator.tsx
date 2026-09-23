import { useState } from 'react';
import { calcSubnet, splitSubnet } from '../lib/subnet';
import { explainSubnet, ipv4Octets } from '../lib/netcalc';
import { BitRow, CopyButton, Message, Results, Steps, card, input } from './calc/shared';

export default function SubnetCalculator({ initial = '192.168.10.73/26' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [splitTo, setSplitTo] = useState('');
  const info = calcSubnet(value);
  const working = info ? explainSubnet(value) : null;
  const n = Number(splitTo);
  const splitValid = info && splitTo !== '' && Number.isInteger(n) && n >= info.cidr && n <= Math.min(32, info.cidr + 12);
  const children = splitValid ? splitSubnet(value, n) : null;

  return (
    <div className={card}>
      <label className="block text-sm font-medium" htmlFor="cidr">IPv4 address / prefix</label>
      <input
        id="cidr"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="192.168.10.73/26"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={!info}
        aria-describedby="cidr-msg"
        className={`mt-1 ${input}`}
      />
      <span id="cidr-msg"><Message>{!info && 'Enter an address with a prefix, like 10.0.0.0/24.'}</Message></span>
      {info && (
        <>
          <Results
            rows={[
              ['Network', `${info.network}/${info.cidr}`],
              ['Broadcast', info.broadcast],
              ['Subnet mask', info.mask],
              ['Wildcard', info.wildcard],
              ['First host', info.firstHost],
              ['Last host', info.lastHost],
              ['Total addresses', info.totalAddresses.toLocaleString()],
              ['Usable hosts', info.usableHosts.toLocaleString()],
            ]}
          />
          <div className="mt-3"><CopyButton text={`${info.network}/${info.cidr}`} label="Copy network" /></div>

          <div className="mt-5 space-y-1.5 rounded-lg border border-line bg-bg p-3">
            <p className="text-sm font-semibold">In binary <span className="font-normal text-muted">(green = network bits, grey = host bits)</span></p>
            <BitRow label="Address" octets={ipv4Octets(info.address)!} network={info.cidr} />
            <BitRow label="Mask" octets={ipv4Octets(info.mask)!} network={info.cidr} />
            <BitRow label="Network" octets={ipv4Octets(info.network)!} network={info.cidr} />
            <BitRow label="Broadcast" octets={ipv4Octets(info.broadcast)!} network={info.cidr} />
          </div>

          {working && <Steps steps={working.steps} />}

          <div className="mt-5 border-t border-line pt-4">
            <label className="text-sm font-medium" htmlFor="split">Split into smaller subnets: /</label>
            <input
              id="split"
              type="number"
              min={info.cidr}
              max={Math.min(32, info.cidr + 12)}
              value={splitTo}
              onChange={(e) => setSplitTo(e.target.value)}
              className={`ml-2 inline-block !w-20 ${input}`}
            />
            {children && (
              <>
                <p className="mt-2 text-xs text-muted">{children.length} subnets</p>
                <ul className="mt-1 max-h-48 overflow-auto font-mono text-sm">
                  {children.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
