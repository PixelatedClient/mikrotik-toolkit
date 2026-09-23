# UPB - Upstream B, AS 64501 (RouterOS v7, MikroTik CHR)
# ether1 -> EDGE, ether2 -> DEST
/system identity set name=UPB

/ip address add address=10.64.2.1/30 interface=ether1 comment="to EDGE"
/ip address add address=10.64.4.1/30 interface=ether2 comment="to DEST"

/routing filter rule add chain=accept-all rule="accept"

/routing bgp template add name=main as=64501 router-id=10.255.0.2
/routing bgp connection add name=to-edge templates=main local.address=10.64.2.1 local.role=ebgp remote.address=10.64.2.2 remote.as=64512 input.filter=accept-all output.filter-chain=accept-all
/routing bgp connection add name=to-dest templates=main local.address=10.64.4.1 local.role=ebgp remote.address=10.64.4.2 remote.as=64999 input.filter=accept-all output.filter-chain=accept-all
