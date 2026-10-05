"""
client_ip.py - the visitor's real IP address
--------------------------------------------------------------------------------------
On the live server the app sits behind a reverse proxy (nginx / Cloudflare)
on the same machine, so request.remote_addr is always the proxy -
127.0.0.1 - and every Login Logs row showed that same address.

get_client_ip() reads the address the proxy passes along instead:
    CF-Connecting-IP  (Cloudflare)
    X-Real-IP         (nginx: proxy_set_header X-Real-IP $remote_addr;)
    X-Forwarded-For   (first address = the original client)

Those headers are only trusted when the request itself came from a local /
private address (i.e. from the proxy). A request straight from the internet
can't fake its IP by sending the headers itself.
"""

import ipaddress
from flask import request


def _valid_ip(value):
    value = (value or "").strip()
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def _from_proxy(addr):
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private


def get_client_ip():
    remote = request.remote_addr or ""
    if not _from_proxy(remote):
        return remote
    for header in ("CF-Connecting-IP", "X-Real-IP"):
        ip = _valid_ip(request.headers.get(header))
        if ip:
            return ip
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        ip = _valid_ip(forwarded.split(",")[0])
        if ip:
            return ip
    return remote
