# GW - office gateway (RouterOS v7, MikroTik CHR)
# ether1 -> ISP (WAN), ether2 -> SRV (LAN)
/system identity set name=GW

/interface list add name=WAN
/interface list add name=LAN
/interface list member add list=WAN interface=ether1
/interface list member add list=LAN interface=ether2

/ip address add address=203.0.113.2/30 interface=ether1 comment="WAN"
/ip address add address=192.168.88.1/24 interface=ether2 comment="LAN"
/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.1

# Protect the router
/ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="accept established"
/ip firewall filter add chain=input action=drop connection-state=invalid comment="drop invalid"
/ip firewall filter add chain=input action=accept protocol=icmp comment="accept ICMP"
/ip firewall filter add chain=input action=accept in-interface-list=LAN comment="accept from LAN"
/ip firewall filter add chain=input action=drop comment="drop everything else"

# Protect the LAN
/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked comment="accept established"
/ip firewall filter add chain=forward action=drop connection-state=invalid comment="drop invalid"
/ip firewall filter add chain=forward action=drop connection-state=new connection-nat-state=!dstnat in-interface-list=WAN comment="drop new from WAN unless port-forwarded"

# Source NAT so the LAN can reach the outside
/ip firewall nat add chain=srcnat action=masquerade out-interface-list=WAN comment="masquerade to WAN"
