# INET - stands in for the internet (RouterOS v7, MikroTik CHR)
# ether1 -> SITE-A, ether2 -> SITE-B. It only forwards between the two public /30 links.
/system identity set name=INET

/ip address add address=203.0.113.1/30 interface=ether1 comment="to SITE-A"
/ip address add address=198.51.100.1/30 interface=ether2 comment="to SITE-B"
