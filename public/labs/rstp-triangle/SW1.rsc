# SW1 - RSTP triangle lab (RouterOS v7, MikroTik CHR as a switch)
# ether1 -> SW2, ether2 -> SW3. SW1 is the intended root bridge.
/system identity set name=SW1

/interface bridge add name=bridge1 protocol-mode=rstp priority=0x1000 comment="root bridge"
/interface bridge port add bridge=bridge1 interface=ether1 comment="to SW2"
/interface bridge port add bridge=bridge1 interface=ether2 comment="to SW3"

# Management address on the bridge, so the switch can be pinged
/ip address add address=10.20.0.1/24 interface=bridge1 comment="management"
