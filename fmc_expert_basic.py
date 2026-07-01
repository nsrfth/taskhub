#!/usr/bin/env python3
import paramiko
import sys
import time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(
    "172.16.0.254",
    username="admin",
    password="Salam123!@#",
    timeout=30,
    look_for_keys=False,
    allow_agent=False,
)
chan = client.invoke_shell()
chan.settimeout(30)
time.sleep(3)

def read_until_idle(max_wait=15):
  end = time.time() + max_wait
  buf = []
  while time.time() < end:
    try:
      if chan.recv_ready():
        buf.append(chan.recv(65536).decode(errors="replace"))
        end = time.time() + 1.5
      else:
        time.sleep(0.2)
    except Exception:
      break
  return "".join(buf)

read_until_idle()
cmds = [
  "expert",
  "pwd",
  "id",
  "ls /",
  "ls /var",
  "exit",
]
all_out = ""
for cmd in cmds:
  chan.send(cmd + "\n")
  out = read_until_idle(12)
  all_out += f"\n>>> {cmd}\n{out}"
chan.close()
client.close()
sys.stdout.write(all_out)
