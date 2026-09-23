# SRV - a server on the LAN (RouterOS v7, MikroTik CHR)
# ether1 -> GW. Its built-in web server (port 80) is what we will publish.
/system identity set name=SRV

/ip address add address=192.168.88.10/24 interface=ether1
/ip route add dst-address=0.0.0.0/0 gateway=192.168.88.1
/ip service set www disabled=no port=80
