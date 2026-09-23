# SITE-B - WireGuard lab (RouterOS v7, MikroTik CHR)
# ether1 -> INET, ether2 -> LAN B
/system identity set name=SITE-B

/ip address add address=198.51.100.2/30 interface=ether1 comment="internet side"
/ip address add address=192.168.2.1/24 interface=ether2 comment="LAN B"
/ip route add dst-address=0.0.0.0/0 gateway=198.51.100.1

/interface wireguard add name=wg0 listen-port=13231
/ip address add address=10.99.0.2/24 interface=wg0 comment="tunnel"

# STEP FOR YOU: read the public key of SITE-A with  /interface wireguard print  on SITE-A, then run:
# /interface wireguard peers add interface=wg0 public-key="PASTE-SITE-A-PUBLIC-KEY" endpoint-address=203.0.113.2 endpoint-port=13231 allowed-address=10.99.0.1/32,192.168.1.0/24 persistent-keepalive=25s

/ip route add dst-address=192.168.1.0/24 gateway=wg0 comment="LAN A through the tunnel"
