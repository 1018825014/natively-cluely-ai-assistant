import argparse
import getpass
import json
import shlex
import sys

import paramiko


sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def run_remote_command(client, command, timeout=180):
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "ignore")
    err = stderr.read().decode("utf-8", "ignore")
    if exit_status != 0:
        raise RuntimeError(err.strip() or out.strip() or f"Remote command failed ({exit_status})")
    return out


def shell_join(parts):
    return " ".join(shlex.quote(str(part)) for part in parts if part is not None and str(part) != "")


def build_remote_command(args):
    admin_cli = ["node", "admin-cli.js"]
    if args.command == "create-license":
        admin_cli.extend(["create-license", "--sku", args.sku, "--buyer", args.buyer])
        if args.duration_days:
            admin_cli.extend(["--duration-days", args.duration_days])
        if args.order:
            admin_cli.extend(["--order", args.order])
        if args.wechat_note:
            admin_cli.extend(["--wechat-note", args.wechat_note])
        if args.order_note:
            admin_cli.extend(["--order-note", args.order_note])
        if args.activation_limit:
            admin_cli.extend(["--activation-limit", args.activation_limit])
        if args.license:
            admin_cli.extend(["--license", args.license])
    elif args.command == "reset-activation":
        admin_cli.extend(["reset-activation", "--license", args.license])
        if args.hardware:
            admin_cli.extend(["--hardware", args.hardware])
    elif args.command == "revoke-license":
        admin_cli.extend(["revoke-license", "--license", args.license])
        if args.reason:
            admin_cli.extend(["--reason", args.reason])
    elif args.command == "renew-license":
        admin_cli.extend(["renew-license", "--license", args.license, "--sku", args.sku])
        if args.duration_days:
            admin_cli.extend(["--duration-days", args.duration_days])
    elif args.command == "show-license":
        admin_cli.extend(["show-license", "--license", args.license])
    elif args.command == "list-licenses":
        admin_cli.extend(["list-licenses"])
        if args.limit:
            admin_cli.extend(["--limit", args.limit])
    else:
        raise RuntimeError(f"Unsupported command: {args.command}")

    return f"cd {shlex.quote(args.remote_dir)} && {shell_join(admin_cli)}"


def decode_json_payload(payload_text):
    text = payload_text.strip()
    decoder = json.JSONDecoder()

    for index, char in enumerate(text):
        if char not in "{[":
            continue

        try:
            payload, end = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue

        if text[index + end :].strip():
            continue

        return payload

    raise RuntimeError(f"Could not find valid JSON in remote output:\n{payload_text}")


def print_json_payload(payload_text):
    payload = decode_json_payload(payload_text)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Run license-lite admin commands on the remote server over SSH.")
    parser.add_argument("--host", default="101.43.20.2")
    parser.add_argument("--username", default="root")
    parser.add_argument("--password", default="")
    parser.add_argument("--remote-dir", default="/srv/natively/app/license-lite")

    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create-license")
    create.add_argument("--sku", required=True)
    create.add_argument("--duration-days", default="")
    create.add_argument("--buyer", required=True)
    create.add_argument("--order", default="")
    create.add_argument("--wechat-note", default="")
    create.add_argument("--order-note", default="")
    create.add_argument("--activation-limit", default="")
    create.add_argument("--license", default="")

    reset = subparsers.add_parser("reset-activation")
    reset.add_argument("--license", required=True)
    reset.add_argument("--hardware", default="")

    revoke = subparsers.add_parser("revoke-license")
    revoke.add_argument("--license", required=True)
    revoke.add_argument("--reason", default="")

    renew = subparsers.add_parser("renew-license")
    renew.add_argument("--license", required=True)
    renew.add_argument("--sku", required=True)
    renew.add_argument("--duration-days", default="")

    show = subparsers.add_parser("show-license")
    show.add_argument("--license", required=True)

    listing = subparsers.add_parser("list-licenses")
    listing.add_argument("--limit", default="20")

    args = parser.parse_args()
    password = args.password or getpass.getpass(f"SSH password for {args.username}@{args.host}: ")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=args.host, username=args.username, password=password, timeout=20)

    try:
        output = run_remote_command(client, build_remote_command(args))
        print_json_payload(output)
    finally:
        client.close()


if __name__ == "__main__":
    main()
