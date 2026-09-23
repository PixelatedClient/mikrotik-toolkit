"""Run a conformance scenario on the real CHR routers (SSH) and print JSON.

usage: python real.py <lab.json> <scenario.json>
The routers are reset to a bare config first (ether8, the management port, is never touched).
"""
import json, sys, time
import paramiko

RESET = [
    '/routing ospf interface-template remove [find]', '/routing ospf area remove [find]', '/routing ospf instance remove [find]',
    '/routing bgp connection remove [find]', '/routing bgp template remove [find where name!=default]',
    '/routing filter rule remove [find]', '/routing bfd configuration remove [find]',
    '/ip firewall filter remove [find where dynamic=no]', '/ip firewall nat remove [find where dynamic=no]', '/ip firewall mangle remove [find where dynamic=no]', '/ip firewall address-list remove [find]',
    '/ip route remove [find where static]', '/ip address remove [find where interface!=ether8]',
    '/ip dhcp-server remove [find]', '/ip dhcp-server network remove [find]', '/ip pool remove [find]',
    '/interface vlan remove [find]', '/interface bridge port remove [find]', '/interface bridge remove [find]',
    '/interface list member remove [find]', '/interface list remove [find where !builtin]', '/ip firewall raw remove [find where dynamic=no]',
    '/interface wireguard peers remove [find]', '/interface wireguard remove [find]',
    '/interface enable [find where type=ether]',
    '/ip service set [find] disabled=no', '/ip service set www-ssl disabled=yes',
    '/interface bridge vlan remove [find]', '/ip dns static remove [find]', '/ip dns set servers="" allow-remote-requests=no',
    '/system identity set name=MikroTik',
]


def connect(host, user, pw):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username=user, password=pw, look_for_keys=False, allow_agent=False, timeout=10)
    return c


def run(c, cmd):
    _, o, e = c.exec_command(cmd, timeout=60)
    return (o.read().decode(errors='replace') + e.read().decode(errors='replace')).replace('\r', '')


def main():
    lab = json.load(open(sys.argv[1], encoding='utf-8'))
    sc = json.load(open(sys.argv[2], encoding='utf-8'))
    ssh = lab['ssh']
    clients = {d: connect(lab['devices'][d]['host'], ssh['user'], ssh['password']) for d in sc['devices']}
    for c in clients.values():
        for cmd in RESET:
            run(c, cmd)
    time.sleep(4)  # let links come back up after the reset re-enabled the ports
    out = []
    for d, cmd, *_ in sc['steps']:
        if cmd.startswith('#sleep'):
            time.sleep(float(cmd.split()[1])); out.append({'dev': d, 'cmd': cmd, 'out': ''}); continue
        out.append({'dev': d, 'cmd': cmd, 'out': run(clients[d], cmd)})
        if cmd.startswith('/ip firewall'):
            time.sleep(0.8)  # rules show as invalid (I) until the firewall has compiled them
    for c in clients.values():
        for cmd in RESET:
            run(c, cmd)
        c.close()
    json.dump(out, sys.stdout)


main()
