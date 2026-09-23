# R2 - OSPF triangle lab (RouterOS v7, MikroTik CHR)
# ether1 -> R1, ether2 -> R3
/system identity set name=R2
/interface bridge add name=loopback comment="loopback"
/ip address add address=10.255.0.2/32 interface=loopback
/ip address add address=10.1.12.2/30 interface=ether1 comment="to R1"
/ip address add address=10.1.23.1/30 interface=ether2 comment="to R3"
/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.2
/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1
/routing ospf interface-template add area=backbone networks=10.1.12.0/30 cost=10
/routing ospf interface-template add area=backbone networks=10.1.23.0/30 cost=10
/routing ospf interface-template add area=backbone networks=10.255.0.2/32 passive
