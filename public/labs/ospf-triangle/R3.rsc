# R3 - OSPF triangle lab (RouterOS v7, MikroTik CHR)
# ether1 -> R2, ether2 -> R1, ether3 -> LAN3 (PC3)
/system identity set name=R3
/interface bridge add name=loopback comment="loopback"
/ip address add address=10.255.0.3/32 interface=loopback
/ip address add address=10.1.23.2/30 interface=ether1 comment="to R2"
/ip address add address=10.1.13.2/30 interface=ether2 comment="to R1 (expensive backup)"
/ip address add address=192.168.30.1/24 interface=ether3 comment="LAN3"
/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.3
/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1
/routing ospf interface-template add area=backbone networks=10.1.23.0/30 cost=10
/routing ospf interface-template add area=backbone networks=10.1.13.0/30 cost=100
/routing ospf interface-template add area=backbone networks=192.168.30.0/24 passive
/routing ospf interface-template add area=backbone networks=10.255.0.3/32 passive
