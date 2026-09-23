# EDGE - two-upstream BGP lab (RouterOS v7, MikroTik CHR), AS 64512
# ether1 -> UPA, ether2 -> UPB. Customer prefix 198.51.100.0/24 lives on bridge "lan".
/system identity set name=EDGE

/interface bridge add name=lan comment="customer prefix, no ports"
/ip address add address=198.51.100.1/24 interface=lan
/ip address add address=10.64.1.2/30 interface=ether1 comment="to UPA"
/ip address add address=10.64.2.2/30 interface=ether2 comment="to UPB"
/ip route add dst-address=198.51.100.0/24 blackhole comment="anchor route so BGP can originate the prefix"
/ip firewall address-list add list=announce address=198.51.100.0/24

# Announce only our own prefix, refuse anything longer than /24
/routing filter rule add chain=out-filter rule="if (dst == 198.51.100.0/24) { accept }"
/routing filter rule add chain=out-filter rule="reject"
/routing filter rule add chain=in-filter rule="if (dst-len > 24) { reject }"
/routing filter rule add chain=in-filter rule="accept"

/routing bgp template add name=main as=64512 router-id=10.255.0.10
/routing bgp connection add name=to-upa templates=main local.address=10.64.1.2 local.role=ebgp remote.address=10.64.1.1 remote.as=64500 output.network=announce output.filter-chain=out-filter input.filter=in-filter
/routing bgp connection add name=to-upb templates=main local.address=10.64.2.2 local.role=ebgp remote.address=10.64.2.1 remote.as=64501 output.network=announce output.filter-chain=out-filter input.filter=in-filter
