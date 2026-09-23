# R3 - three-router lab (RouterOS v7, MikroTik CHR)
# ether1 -> R2, ether2 -> LAN3 (PC3)
/system identity set name=R3
/ip address add address=10.0.23.2/30 interface=ether1 comment="to R2"
/ip address add address=192.168.3.1/24 interface=ether2 comment="LAN3"
/ip route add dst-address=10.0.12.0/30 gateway=10.0.23.1 comment="R1-R2 link"
/ip route add dst-address=192.168.1.0/24 gateway=10.0.23.1 comment="LAN1 via R2"
