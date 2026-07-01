#!/usr/bin/env python3
"""Fetch FMC access control policies and rules via REST API."""
import json
import ssl
import urllib.error
import urllib.request

HOST = "172.16.0.254"
USER = "admin"
PASSWORD = "Salam123!@#"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def api_request(method: str, path: str, token: str | None = None, body=None):
    url = f"https://{HOST}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-auth-access-token", token)
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        return resp.headers, json.loads(resp.read().decode())


def main():
    headers, _ = api_request("POST", "/api/fmc_platform/v1/auth/generatetoken")
    token = headers.get("X-auth-access-token")
    domain = headers.get("DOMAIN_UUID", "")
    if not token:
        raise SystemExit("Authentication failed: no token returned")
    print(f"Connected to FMC {HOST} (domain {domain})\n")

    _, policies = api_request(
        "GET",
        f"/api/fmc_config/v1/domain/{domain}/policy/accesspolicies?expanded=true&limit=100",
        token,
    )

    items = policies.get("items", [])
    if not items:
        print("No access control policies found.")
        return

    for policy in items:
        name = policy.get("name", "(unnamed)")
        pid = policy.get("id", "")
        default_action = policy.get("defaultAction", {})
        default_type = default_action.get("type", default_action.get("action", "unknown"))
        print("=" * 70)
        print(f"Policy: {name}")
        print(f"ID: {pid}")
        print(f"Default action: {default_type}")
        if policy.get("description"):
            print(f"Description: {policy['description']}")

        # Fetch rules for this policy
        try:
            _, rules_resp = api_request(
                "GET",
                f"/api/fmc_config/v1/domain/{domain}/policy/accesspolicies/{pid}/accessrules?expanded=true&limit=500",
                token,
            )
        except urllib.error.HTTPError as e:
            print(f"  Could not fetch rules: HTTP {e.code} {e.reason}")
            continue

        rules = rules_resp.get("items", [])
        print(f"Rules: {len(rules)}")
        print("-" * 70)
        for rule in sorted(rules, key=lambda r: r.get("ruleIndex", r.get("id", 0))):
            idx = rule.get("ruleIndex", "?")
            rname = rule.get("name", "(unnamed)")
            action = rule.get("action", "unknown")
            enabled = rule.get("enabled", True)
            rtype = rule.get("type", "")
            log = rule.get("logBegin", False) or rule.get("logEnd", False) or rule.get("sendEventsToFMC", False)

            line = f"  [{idx}] {rname} | action={action} | enabled={enabled}"
            if rtype:
                line += f" | type={rtype}"
            if log:
                line += " | logging=yes"

            # Summarize source/destination if present
            src = rule.get("sourceNetworks", {})
            dst = rule.get("destinationNetworks", {})
            if src or dst:
                src_names = [x.get("name", x.get("id", "?")) for x in (src.get("objects", []) + src.get("literals", []))][:3]
                dst_names = [x.get("name", x.get("id", "?")) for x in (dst.get("objects", []) + dst.get("literals", []))][:3]
                if src_names:
                    line += f" | src={','.join(str(s) for s in src_names)}"
                if dst_names:
                    line += f" | dst={','.join(str(d) for d in dst_names)}"

            print(line)
        print()


if __name__ == "__main__":
    main()
