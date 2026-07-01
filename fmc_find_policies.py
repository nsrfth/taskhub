#!/usr/bin/env python3
import paramiko
import sys
import time

HOST = "172.16.0.254"
USER = "admin"
PASSWORD = "Salam123!@#"

COMMANDS = [
    "expert",
    "grep -r accesspolicy /var/sf 2>/dev/null | head -5",
    "find /var/sf -maxdepth 3 -type f -name '*access*' 2>/dev/null | head -30",
    "ls -la /var/sf 2>/dev/null | head -30",
    "ls -la /var/log 2>/dev/null | head -20",
    "/usr/local/sf/bin/DatabaseExporter --help 2>&1 | head -30",
    "exit",
]


def run_shell(commands, wait=4.0):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username=USER,
        password=PASSWORD,
        timeout=30,
        look_for_keys=False,
        allow_agent=False,
    )
    chan = client.invoke_shell()
    time.sleep(2)

    def drain():
        chunks = []
        while chan.recv_ready():
            chunks.append(chan.recv(65536).decode(errors="replace"))
        return "".join(chunks)

    drain()
    output = []
    for cmd in commands:
        chan.send(cmd + "\n")
        time.sleep(wait)
        out = drain()
        output.append(f">>> {cmd}\n{out}")
    chan.close()
    client.close()
    return "\n".join(output)


if __name__ == "__main__":
    sys.stdout.write(run_shell(COMMANDS, wait=5))
