# R1 - three-router lab (RouterOS v7, MikroTik CHR)
# ether1 -> R2, ether2 -> LAN1 (PC1)
/system identity set name=R1
/ip address add address=10.0.12.1/30 interface=ether1 comment="to R2"
/ip address add address=192.168.1.1/24 interface=ether2 comment="LAN1"
/ip route add dst-address=10.0.23.0/30 gateway=10.0.12.2 comment="R2-R3 link"
/ip route add dst-address=192.168.3.0/24 gateway=10.0.12.2 comment="LAN3 via R2"
