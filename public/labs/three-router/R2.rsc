# R2 - three-router lab (RouterOS v7, MikroTik CHR)
# ether1 -> R1, ether2 -> R3
/system identity set name=R2
/ip address add address=10.0.12.2/30 interface=ether1 comment="to R1"
/ip address add address=10.0.23.1/30 interface=ether2 comment="to R3"
/ip route add dst-address=192.168.1.0/24 gateway=10.0.12.1 comment="LAN1 via R1"
/ip route add dst-address=192.168.3.0/24 gateway=10.0.23.2 comment="LAN3 via R3"
