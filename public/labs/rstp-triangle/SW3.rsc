# SW3 - RSTP triangle lab (RouterOS v7, MikroTik CHR as a switch)
# ether1 -> SW2, ether2 -> SW1, ether3 -> PC2. SW3 keeps the default priority (0x8000).
/system identity set name=SW3

/interface bridge add name=bridge1 protocol-mode=rstp comment="leaf, default priority"
/interface bridge port add bridge=bridge1 interface=ether1 comment="to SW2"
/interface bridge port add bridge=bridge1 interface=ether2 comment="to SW1"
/interface bridge port add bridge=bridge1 interface=ether3 edge=yes bpdu-guard=yes comment="PC2, edge port"

/ip address add address=10.20.0.3/24 interface=bridge1 comment="management"
