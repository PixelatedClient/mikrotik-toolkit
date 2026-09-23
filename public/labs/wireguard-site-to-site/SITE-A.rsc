# SITE-A - WireGuard lab (RouterOS v7, MikroTik CHR)
# ether1 -> INET, ether2 -> LAN A
/system identity set name=SITE-A

/ip address add address=203.0.113.2/30 interface=ether1 comment="internet side"
/ip address add address=192.168.1.1/24 interface=ether2 comment="LAN A"
/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.1

/interface wireguard add name=wg0 listen-port=13231
/ip address add address=10.99.0.1/24 interface=wg0 comment="tunnel"

# STEP FOR YOU: read the public key of SITE-B with  /interface wireguard print  on SITE-B, then run:
# /interface wireguard peers add interface=wg0 public-key="PASTE-SITE-B-PUBLIC-KEY" endpoint-address=198.51.100.2 endpoint-port=13231 allowed-address=10.99.0.2/32,192.168.2.0/24 persistent-keepalive=25s

/ip route add dst-address=192.168.2.0/24 gateway=wg0 comment="LAN B through the tunnel"
