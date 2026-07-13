#!/usr/bin/env python3
"""Bridge client for the live Blender TCP bridge.

Usage:
    python3 bridge_client.py <script.py> [--timeout N]

Reads the given Python source file, sends it to Blender over the TCP bridge
at localhost:9876, and prints the full JSON response to stdout.
Exit code 0 iff response status == "ok".
"""
import argparse
import json
import socket
import sys


HOST = "127.0.0.1"
PORT = 9876


def send_code(code, timeout=1800.0, host=HOST, port=PORT):
    """Send Python source to the Blender bridge and return the parsed JSON response."""
    payload = json.dumps({
        "type": "execute",
        "code": code,
        "strict_json": False,
    }).encode("utf-8") + b"\0"

    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(payload)

        buf = bytearray()
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            buf.extend(chunk)
            if buf and buf[-1] == 0:  # null terminator
                break

    if buf and buf[-1] == 0:
        buf = buf[:-1]
    return json.loads(buf.decode("utf-8"))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Send a Python script to the live Blender bridge.")
    parser.add_argument("script", help="Path to the Python source file to execute in Blender.")
    parser.add_argument("--timeout", type=float, default=1800.0,
                        help="Socket timeout in seconds (default 1800).")
    args = parser.parse_args(argv)

    with open(args.script, "r", encoding="utf-8") as fh:
        code = fh.read()

    try:
        response = send_code(code, timeout=args.timeout)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"status": "error", "message": f"bridge_client transport error: {exc!r}"}))
        return 1

    print(json.dumps(response, indent=2))
    return 0 if response.get("status") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
