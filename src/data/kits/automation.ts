import type { LessonKit } from '../lessonKit';

export const AUTOMATION_KITS: LessonKit[] = [
  {
    lesson: 'automation/01-git-for-configuration',
    level: 'Professional',
    quiz: [
      { q: 'What does a branch let you do that committing directly to your main history does not?', options: ['Test a risky change without it ever touching the record you rely on if it fails', 'Save disk space', 'Encrypt the repository', 'Skip writing commit messages'], answer: 0, explain: 'A branch is a separate line of history; the main branch never sees a failed attempt made on another branch.' },
      { q: 'Why can\'t you fully remove a secret from a Git repository just by deleting it in a later commit?', options: ['The earlier commit still has it in the history', 'Git encrypts old commits automatically', 'Deleting requires admin rights', 'Secrets are stored outside the repository'], answer: 0, explain: 'A later commit only changes the newest snapshot; the secret remains readable in the earlier commit forever.' },
      { q: 'Which command shows exactly what changed in one specific commit?', options: ['git diff', 'git init', 'git add', 'git branch'], answer: 0, explain: 'git diff (e.g. against the previous commit) shows the exact lines added and removed.' },
    ],
  },
  {
    lesson: 'automation/02-python-basics-for-network-engineers',
    level: 'Professional',
    quiz: [
      { q: 'What does a for loop let you avoid writing by hand?', options: ['A separate copy of the same code for every item in a list', 'The need for variables', 'The need for functions', 'File access'], answer: 0, explain: 'A for loop repeats one block of code once per item, instead of writing it out per device or address.' },
      { q: 'Why package repeated logic into a function instead of copying it each time?', options: ['So a fix or change only needs to happen in one place', 'Because Python requires it', 'Functions run faster than inline code', 'It removes the need for loops'], answer: 0, explain: 'A function is defined once and reused; a bug fixed in it is fixed everywhere it is called.' },
      { q: 'What does r.json() do to an HTTP response, and why is that useful?', options: ['Turns it into a Python list or dictionary you can loop over directly', 'Encrypts the response', 'Sends the response back to the server', 'Converts it to plain text only'], answer: 0, explain: 'r.json() parses the response into native Python data, ready to loop over or inspect like any other list or dict.' },
    ],
  },
  {
    lesson: 'automation/03-routeros-rest-api',
    level: 'Professional',
    quiz: [
      { q: 'Which HTTP verb corresponds to set in the terminal?', options: ['PATCH', 'GET', 'PUT', 'DELETE'], answer: 0, explain: 'PATCH modifies an existing item, the same as set changes an existing config entry in the terminal.' },
      { q: 'Why prefer a dedicated API account over the main admin login for a script?', options: ['So a leaked script credential has limited reach instead of full admin access', 'Dedicated accounts are required by RouterOS', 'It makes the API respond faster', 'It avoids the need for HTTPS'], answer: 0, explain: 'Scoping the account limits the damage if the script\'s credential is ever exposed.' },
      { q: 'What does adding ?interface=ether1 to the URL do?', options: ['Filters the results to only that interface, like where in the terminal', 'Creates a new interface named ether1', 'Deletes all other interfaces', 'Restarts ether1'], answer: 0, explain: 'Query parameters filter a GET request\'s results, the REST equivalent of a where clause.' },
    ],
  },
  {
    lesson: 'automation/04-templating-and-idempotent-changes',
    level: 'Professional',
    quiz: [
      { q: 'What problem does filling values into a fixed template solve that copy-pasting does not?', options: ['It removes leftover values from the source device being copied by mistake', 'It makes the config run faster', 'It removes the need for any per-device values at all', 'It encrypts the config'], answer: 0, explain: 'Copy-paste risks stray values from the source device; a template fills only the values that should actually differ.' },
      { q: 'What does it mean for a script to be idempotent?', options: ['Running it twice produces the same result as running it once', 'It runs twice as fast on the second run', 'It only works once and then must be rewritten', 'It cannot be run on more than one device'], answer: 0, explain: 'An idempotent script checks the current state and only changes what is not already correct.' },
      { q: 'Why does idempotence matter more as the number of managed devices grows?', options: ['A safe re-run after a partial failure matters more the more devices could be left inconsistent', 'It makes scripts shorter', 'It removes the need for an inventory', 'It is only relevant for a single device'], answer: 0, explain: 'Across many devices, a non-idempotent re-run after a failure can leave a large, hard-to-diagnose inconsistent fleet.' },
    ],
  },
  {
    lesson: 'automation/05-ansible',
    level: 'Professional',
    quiz: [
      { q: 'What does an Ansible inventory file describe that a playbook does not?', options: ['Which hosts to target', 'What change to make', 'How to authenticate to RouterOS', 'The quiz answers'], answer: 0, explain: 'The inventory lists the hosts (and groups); the playbook describes the desired state to apply to them.' },
      { q: 'Why is idempotence in a playbook module valuable when the same playbook targets many hosts?', options: ['A re-run only changes hosts not already in the desired state, instead of repeating every change everywhere', 'It makes the playbook run in parallel automatically', 'It removes the need for an inventory file', 'It disables logging'], answer: 0, explain: 'Idempotent modules report no change on hosts already correct, making repeated runs safe across a whole fleet.' },
      { q: 'What does Ansible give you after a run that a hand-written script would need extra code to produce?', options: ['A per-host report of what changed and what did not', 'Faster network throughput', 'Automatic firmware upgrades', 'A GUI'], answer: 0, explain: 'Ansible reports changed/ok/failed per host and per task without you writing that reporting logic yourself.' },
    ],
  },
];
