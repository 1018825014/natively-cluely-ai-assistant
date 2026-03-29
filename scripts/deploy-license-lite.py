import argparse
import getpass
import pathlib
import secrets
import sys
import textwrap

import paramiko


sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def run_command(client, command, timeout=1800, check=True):
    print(f">>> {command}")
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "ignore")
    err = stderr.read().decode("utf-8", "ignore")
    if out.strip():
        print(out)
    if err.strip():
        print(err)
    print(f"[exit={exit_status}]")
    if check and exit_status != 0:
        raise RuntimeError(f"Remote command failed ({exit_status}): {command}")
    return exit_status, out, err


def parse_env_text(raw_text):
    values = {}
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def main():
    parser = argparse.ArgumentParser(description="Deploy license-lite to a Linux server over SSH.")
    parser.add_argument("--host", required=True)
    parser.add_argument("--username", default="root")
    parser.add_argument("--password", default="")
    parser.add_argument("--archive", default=str(pathlib.Path("tmp/license-lite.tar.gz").resolve()))
    parser.add_argument("--public-base-url", default="")
    parser.add_argument("--app-root", default="/srv/natively")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--server-name", default="")
    parser.add_argument("--admin-username", default="admin")
    parser.add_argument("--admin-password", default="")
    parser.add_argument("--admin-session-hours", type=int, default=168)
    parser.add_argument("--skip-nginx", action="store_true")
    parser.add_argument("--skip-pm2-startup", action="store_true")
    args = parser.parse_args()

    archive_path = pathlib.Path(args.archive).resolve()
    if not archive_path.exists():
        raise SystemExit(f"Archive not found: {archive_path}")

    public_base_url = args.public_base_url or f"http://{args.host}"
    server_name = args.server_name or args.host
    remote_archive = f"{args.app_root}/app/license-lite.tar.gz"
    remote_env = f"{args.app_root}/app/license-lite.env"

    password = args.password or getpass.getpass(f"SSH password for {args.username}@{args.host}: ")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=args.host, username=args.username, password=password, timeout=20)

    try:
        run_command(client, "mkdir -p /usr/local/bin", timeout=120)
        run_command(
            client,
            "ln -sf /usr/local/lib/nodejs/node-v22.22.2-linux-x64/bin/pm2 /usr/local/bin/pm2 && "
            "ln -sf /usr/local/lib/nodejs/node-v22.22.2-linux-x64/bin/pm2-runtime /usr/local/bin/pm2-runtime",
            timeout=120,
        )

        sftp = client.open_sftp()
        try:
            for path in (args.app_root, f"{args.app_root}/app", f"{args.app_root}/data"):
                try:
                    sftp.mkdir(path)
                except OSError:
                    pass

            existing_env = {}
            try:
                with sftp.file(remote_env, "r") as file_handle:
                    existing_env = parse_env_text(file_handle.read().decode("utf-8", "ignore"))
            except OSError:
                existing_env = {}

            license_secret = existing_env.get("LICENSE_SIGNING_SECRET") or secrets.token_hex(32)
            admin_username = args.admin_username or existing_env.get("ADMIN_USERNAME") or "admin"
            admin_password = args.admin_password or existing_env.get("ADMIN_PASSWORD") or secrets.token_hex(6)
            admin_session_secret = existing_env.get("ADMIN_SESSION_SECRET") or secrets.token_hex(32)

            env_content = textwrap.dedent(
                f"""\
                HOST=127.0.0.1
                PORT={args.port}
                PUBLIC_BASE_URL={public_base_url}
                DATA_DIR={args.app_root}/data
                LICENSE_SIGNING_SECRET={license_secret}
                LICENSE_OFFLINE_GRACE_DAYS=5
                LICENSE_MAX_ACTIVATIONS=1
                ADMIN_USERNAME={admin_username}
                ADMIN_PASSWORD={admin_password}
                ADMIN_SESSION_SECRET={admin_session_secret}
                ADMIN_SESSION_HOURS={args.admin_session_hours}
                """
            )

            sftp.put(str(archive_path), remote_archive)
            with sftp.file(remote_env, "w") as file_handle:
                file_handle.write(env_content)
        finally:
            sftp.close()

        run_command(client, f"cd {args.app_root}/app && rm -rf license-lite && tar -xzf license-lite.tar.gz")
        run_command(client, f"cp {remote_env} {args.app_root}/app/license-lite/.env")
        run_command(client, f"cd {args.app_root}/app/license-lite && npm install --omit=dev")
        run_command(client, f"cd {args.app_root}/app/license-lite && pm2 delete natively-license-lite || true", check=False)
        run_command(client, f"cd {args.app_root}/app/license-lite && pm2 start server.js --name natively-license-lite")
        run_command(client, "pm2 save")

        if not args.skip_pm2_startup:
            run_command(client, "pm2 startup systemd -u root --hp /root", check=False)

        if not args.skip_nginx:
            nginx_config = textwrap.dedent(
                f"""\
                cat > /etc/nginx/conf.d/natively-license-lite.conf <<'EOF'
                server {{
                    listen 80;
                    server_name {server_name};

                    location / {{
                        proxy_pass http://127.0.0.1:{args.port};
                        proxy_http_version 1.1;
                        proxy_set_header Host $host;
                        proxy_set_header X-Real-IP $remote_addr;
                        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                        proxy_set_header X-Forwarded-Proto $scheme;
                    }}
                }}
                EOF
                """
            ).strip()
            run_command(client, nginx_config)
            run_command(client, "nginx -t")
            run_command(client, "systemctl enable nginx")
            run_command(client, "systemctl restart nginx")

        run_command(client, f"curl -fsSL http://127.0.0.1:{args.port}/healthz")
        print(f"DEPLOYED_ENV={args.app_root}/app/license-lite/.env")
        print(f"ADMIN_URL={public_base_url.rstrip('/')}/admin/")
        print(f"ADMIN_USERNAME={admin_username}")
        print(f"ADMIN_PASSWORD={admin_password}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
