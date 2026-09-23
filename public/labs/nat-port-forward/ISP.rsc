# ISP - the outside world (RouterOS v7, MikroTik CHR)
# ether1 -> GW. Address 8.8.8.8 on a loopback gives the LAN something to ping.
/system identity set name=ISP

/interface bridge add name=loopback comment="loopback"
/ip address add address=8.8.8.8/32 interface=loopback comment="pretend public server"
/ip address add address=203.0.113.1/30 interface=ether1 comment="to GW"
