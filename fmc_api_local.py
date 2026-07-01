#!/usr/bin/env python3
import paramiko
import sys
import time

HOST = "172.16.0.254"
USER = "admin"
PASSWORD = "Salam123!@#"

COMMANDS = [
    "expert",
    "curl -sk -X POST 'https://127.0.0.1/api/fmc_platform/v1/auth/generatetoken' -H 'username: admin' -H 'password: Salam123!@#' -D /tmp/fmc_headers.txt -o /tmp/fmc_body.txt; echo CURL_EXIT:$?",
    "head -20 /tmp/fmc_headers.txt; echo '---'; cat /tmp/fmc_body.txt",
    "which sfcli sfcontrol 2>/dev/null; ls /usr/local/sf/bin 2>/dev/null | head -20",
    "sudo -n true 2>/dev/null && echo SUDO_OK || echo SUDO_NO",
    "exit",
]


def run_shell(commands, wait=5.0):
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
    sys.stdout.write(run_shell(COMMANDS))
