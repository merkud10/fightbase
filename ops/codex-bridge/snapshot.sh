#!/bin/sh
# Слепок состояния VPS для сверки до/после работ. Только чтение.
set -u
echo "## docker"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | sort
echo "## iptables"
iptables -S
iptables -t nat -S
echo "## listening"
ss -tlnupH | awk '{print $1, $5}' | sort -u
echo "## users"
cut -d: -f1 /etc/passwd | sort | tr '\n' ' '
echo
echo "## units"
systemctl list-units --type=service --state=running --no-legend --plain | awk '{print $1}' | sort
echo "## resources"
free -m | sed -n '1,2p'
df -h / | tail -n 1
