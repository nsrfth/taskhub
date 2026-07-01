#!/usr/bin/env python3
import paramiko
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    "172.16.0.254",
    username="admin",
    password="Salam123!@#",
    timeout=30,
    look_for_keys=False,
    allow_agent=False,
)
chan = c.invoke_shell()
time.sleep(2)

def drain():
    s = ""
    while chan.recv_ready():
        s += chan.recv(65536).decode(errors="replace")
    return s

drain()
for cmd in ["show network", "show version"]:
    chan.send(cmd + "\n")
    time.sleep(3)
    print(f">>> {cmd}")
    print(drain())
chan.close()
c.close()
