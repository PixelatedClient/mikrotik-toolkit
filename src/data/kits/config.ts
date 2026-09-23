import type { LessonKit } from '../lessonKit';

export const CONFIG_KITS: LessonKit[] = [
  {
    lesson: 'config/01-change-workflow',
    level: 'Associate',
    labs: ['first-link'],
    quiz: [
      { q: 'Why is the backup step before the change?', options: ['So you have something to go back to', 'It is faster', 'Because the router requires it', 'It clears the log'], answer: 0, explain: 'After the change is too late: the old state is gone.' },
      { q: 'You are adding an input drop rule and a rule that accepts your own address. Which goes first in the chain?', options: ['The drop rule', 'The accept rule for your address', 'It does not matter', 'Neither, use NAT'], answer: 1, explain: 'The first matching rule wins, so accept your address above the drop, or you cut yourself off.' },
      { q: 'Where should you verify a change?', options: ['Only on the router', 'From a host on the user side as well', 'Only in the log', 'Nowhere, trust the router'], answer: 1, explain: 'A router can be happy while users cannot reach anything. Test the real path.' },
    ],
  },
  {
    lesson: 'config/02-exports-diffs-and-version-control',
    level: 'Associate',
    quiz: [
      { q: 'What can you do with an export that you cannot do with a binary backup?', options: ['Read, compare and reuse it on another router', 'Restore faster', 'Include the licence', 'Hide passwords'], answer: 0, explain: 'An export is plain text, so diffs and version control work on it.' },
      { q: 'What does /import file-name=x.rsc do to the existing configuration?', options: ['Erases it first', 'Applies the commands on top of it', 'Does nothing', 'Reboots the router'], answer: 1, explain: 'It does not clean the router. Reset with no default configuration first for a clean rebuild.' },
      { q: 'Why not post an unedited export in a public forum?', options: ['It can reveal keys, secrets and your network layout', 'It is too long', 'It breaks the forum', 'Nothing, it is fine'], answer: 0, explain: 'Remove keys, passwords and public addresses before sharing.' },
    ],
  },
  {
    lesson: 'config/03-scripts-and-scheduler',
    level: 'Associate',
    quiz: [
      { q: 'What is the difference between :local and :global?', options: [':local lives in the script, :global survives between scripts', 'They are the same', ':global is faster', ':local is saved to disk'], answer: 0, explain: 'Use :local by default and :global only when scripts need to share a value.' },
      { q: 'Which command runs a script every day at 03:00?', options: ['/system scheduler add name=n interval=1d start-time=03:00:00 on-event=script-name', '/system script add every=1d', '/ip schedule add', '/tool cron 0 3'], answer: 0, explain: 'The scheduler has interval, start-time and on-event.' },
      { q: 'Why copy a nightly export off the router?', options: ['A dead router takes its files with it', 'The router cannot hold files', 'Exports expire', 'It speeds up backups'], answer: 0, explain: 'A backup on the same device is lost together with the device.' },
    ],
  },
  {
    lesson: 'config/04-templates-and-repeatable-deployments',
    level: 'Associate',
    quiz: [
      { q: 'What are the three layers of a router template?', options: ['Baseline, role and site values', 'Router, switch, cable', 'Input, forward, output', 'Bronze, silver, gold'], answer: 0, explain: 'Baseline (same everywhere), role (gateway, switch, edge) and per-site values.' },
      { q: 'Which change goes last in a deployment script?', options: ['Enabling VLAN filtering and other access-limiting settings', 'The identity', 'The users', 'Interface names'], answer: 0, explain: 'Restrictive changes come last so a mistake does not cut off the script itself.' },
      { q: 'You find a bug in one deployed router built from a template. What is best?', options: ['Fix only that router by hand', 'Fix the template and apply it everywhere it is used', 'Ignore it', 'Rebuild from scratch'], answer: 1, explain: 'The template is the source of truth. Fixing only one router brings back the drift you were avoiding.' },
    ],
  },
  {
    lesson: 'config/05-remote-changes-and-rollback',
    level: 'Associate',
    labs: ['first-link'],
    quiz: [
      { q: 'What does safe mode do when your connection drops?', options: ['Undoes the changes made in the session', 'Reboots the router', 'Keeps everything', 'Locks the router'], answer: 0, explain: 'It is a built-in undo for one risky change at a time. Ctrl+X toggles it in the terminal.' },
      { q: 'What must you always do after a timed revert turns out unnecessary?', options: ['Cancel the scheduled revert', 'Reboot', 'Reset', 'Nothing'], answer: 0, explain: 'A forgotten revert will undo your good change later.' },
      { q: 'You locked yourself out of a router with no IPv4 access. Which tool can still reach it from a neighbour on the same segment?', options: ['MAC-telnet or a link-local IPv6 address', 'Ping to its old address', 'DNS', 'A new VLAN'], answer: 0, explain: 'Both work below IPv4, so a router with a broken IPv4 configuration is still reachable from a neighbour.' },
    ],
  },
];
