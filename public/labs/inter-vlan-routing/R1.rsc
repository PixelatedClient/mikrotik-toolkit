# R1 - inter-VLAN routing lab (RouterOS v7, MikroTik CHR)
# ether2 -> trunk to SW1. Routes and filters between VLAN 10 (staff), 20 (guest) and 99 (management).
/system identity set name=R1

/interface vlan add name=vlan10-staff interface=ether2 vlan-id=10
/interface vlan add name=vlan20-guest interface=ether2 vlan-id=20
/interface vlan add name=vlan99-mgmt interface=ether2 vlan-id=99
/interface list add name=LAN
/interface list member add list=LAN interface=vlan10-staff
/interface list member add list=LAN interface=vlan20-guest
/interface list member add list=LAN interface=vlan99-mgmt

/ip address add address=10.0.10.1/24 interface=vlan10-staff
/ip address add address=10.0.20.1/24 interface=vlan20-guest
/ip address add address=10.0.99.1/24 interface=vlan99-mgmt

/ip pool add name=pool-staff ranges=10.0.10.10-10.0.10.254
/ip pool add name=pool-guest ranges=10.0.20.10-10.0.20.254
/ip dhcp-server add name=dhcp-staff interface=vlan10-staff address-pool=pool-staff lease-time=1h disabled=no
/ip dhcp-server add name=dhcp-guest interface=vlan20-guest address-pool=pool-guest lease-time=1h disabled=no
/ip dhcp-server network add address=10.0.10.0/24 gateway=10.0.10.1 dns-server=10.0.10.1
/ip dhcp-server network add address=10.0.20.0/24 gateway=10.0.20.1 dns-server=10.0.20.1

# Protect the router
/ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="accept established"
/ip firewall filter add chain=input action=drop connection-state=invalid comment="drop invalid"
/ip firewall filter add chain=input action=accept protocol=icmp comment="accept ICMP"
/ip firewall filter add chain=input action=accept in-interface-list=LAN protocol=udp dst-port=67 comment="DHCP"
/ip firewall filter add chain=input action=accept in-interface=vlan99-mgmt comment="management VLAN may manage the router"
/ip firewall filter add chain=input action=drop comment="drop everything else"

# Policy between VLANs: staff may reach guest, nothing else crosses
/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked comment="accept established"
/ip firewall filter add chain=forward action=drop connection-state=invalid comment="drop invalid"
/ip firewall filter add chain=forward action=accept in-interface=vlan10-staff out-interface=vlan20-guest comment="staff may reach guest"
/ip firewall filter add chain=forward action=drop comment="isolate everything else"
