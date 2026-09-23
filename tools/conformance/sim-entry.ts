// Bundled by run.mjs and executed under node: runs a scenario on the simulator.
import { Device, Network, runCommand } from '../../src/lib/sim';

export interface Lab {
  devices: Record<string, { host: string }>;
  links: [string, string, string, string][];
}
export type Step = [string, string, ('warm')?];
export interface Scenario {
  name: string;
  description?: string;
  devices: string[];
  steps: Step[];
}
export interface StepResult {
  dev: string;
  cmd: string;
  out: string;
}

export function runOnSim(lab: Lab, sc: Scenario): StepResult[] {
  const net = new Network();
  const devs = new Map<string, Device>();
  Object.keys(lab.devices).forEach((id, i) => devs.set(id, net.add(new Device(id, 'router', i, 8))));
  for (const [a, ai, b, bi] of lab.links) net.connect(a, ai, b, bi);
  return sc.steps.map(([dev, cmd]) => {
    if (cmd.startsWith('#sleep')) return { dev, cmd, out: '' };
    const d = devs.get(dev);
    if (!d) throw new Error(`scenario ${sc.name}: unknown device ${dev}`);
    return { dev, cmd, out: runCommand(d, cmd, []).output };
  });
}
