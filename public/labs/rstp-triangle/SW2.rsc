# SW2 - RSTP triangle lab (RouterOS v7, MikroTik CHR as a switch)
# ether1 -> SW1, ether2 -> SW3, ether3 -> PC1. SW2 is the intended backup root.
/system identity set name=SW2

/interface bridge add name=bridge1 protocol-mode=rstp priority=0x2000 comment="backup root"
/interface bridge port add bridge=bridge1 interface=ether1 comment="to SW1"
/interface bridge port add bridge=bridge1 interface=ether2 comment="to SW3"
/interface bridge port add bridge=bridge1 interface=ether3 edge=yes bpdu-guard=yes comment="PC1, edge port"

/ip address add address=10.20.0.2/24 interface=bridge1 comment="management"
