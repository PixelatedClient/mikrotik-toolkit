# DEST - the destination network, AS 64999 (RouterOS v7, MikroTik CHR)
# ether1 -> UPA, ether2 -> UPB. Prefix 203.0.113.0/24 lives on bridge "lan".
/system identity set name=DEST

/interface bridge add name=lan comment="destination prefix, no ports"
/ip address add address=203.0.113.1/24 interface=lan
/ip address add address=10.64.3.2/30 interface=ether1 comment="to UPA"
/ip address add address=10.64.4.2/30 interface=ether2 comment="to UPB"
/ip route add dst-address=203.0.113.0/24 blackhole comment="anchor route so BGP can originate the prefix"
/ip firewall address-list add list=announce address=203.0.113.0/24

/routing filter rule add chain=out-filter rule="if (dst == 203.0.113.0/24) { accept }"
/routing filter rule add chain=out-filter rule="reject"
/routing filter rule add chain=in-filter rule="accept"

/routing bgp template add name=main as=64999 router-id=10.255.0.99
/routing bgp connection add name=to-upa templates=main local.address=10.64.3.2 local.role=ebgp remote.address=10.64.3.1 remote.as=64500 output.network=announce output.filter-chain=out-filter input.filter=in-filter
/routing bgp connection add name=to-upb templates=main local.address=10.64.4.2 local.role=ebgp remote.address=10.64.4.1 remote.as=64501 output.network=announce output.filter-chain=out-filter input.filter=in-filter
