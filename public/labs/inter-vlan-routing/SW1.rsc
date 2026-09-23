# SW1 - inter-VLAN routing lab (RouterOS v7, MikroTik CHR as a switch)
# ether1 = trunk to R1, ether2 = PC1 (staff), ether3 = PC2 (guest), ether4 = PC3 (staff)
/system identity set name=SW1

/interface bridge add name=bridge1 vlan-filtering=no
/interface bridge port add bridge=bridge1 interface=ether1 frame-types=admit-only-vlan-tagged comment="trunk to R1"
/interface bridge port add bridge=bridge1 interface=ether2 pvid=10 frame-types=admit-only-untagged-and-priority-tagged comment="PC1 staff"
/interface bridge port add bridge=bridge1 interface=ether3 pvid=20 frame-types=admit-only-untagged-and-priority-tagged comment="PC2 guest"
/interface bridge port add bridge=bridge1 interface=ether4 pvid=10 frame-types=admit-only-untagged-and-priority-tagged comment="PC3 staff"

/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=ether1 untagged=ether2,ether4 comment="staff"
/interface bridge vlan add bridge=bridge1 vlan-ids=20 tagged=ether1 untagged=ether3 comment="guest"
/interface bridge vlan add bridge=bridge1 vlan-ids=99 tagged=bridge1,ether1 comment="mgmt"

/interface vlan add name=vlan99-mgmt interface=bridge1 vlan-id=99
/ip address add address=10.0.99.2/24 interface=vlan99-mgmt
/ip route add dst-address=0.0.0.0/0 gateway=10.0.99.1

# Enable filtering last so a mistake above cannot lock you out
/interface bridge set bridge1 vlan-filtering=yes
