"""Build a personal Thunderbird add-on and a local MCP configuration."""

import argparse
import json
import os
import secrets
import sys
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

SOURCE = Path(__file__).resolve().parent


def default_data_dir():
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "ThunderbirdMailMCP"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "ThunderbirdMailMCP"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "thunderbird-mail-mcp"


def atomic_write(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix=".setup-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def install(data_dir, port=None):
    data_dir = data_dir.expanduser().resolve()
    if data_dir == SOURCE or SOURCE in data_dir.parents:
        raise ValueError("Choose a private data directory outside this source repository.")
    data_dir.mkdir(parents=True, exist_ok=True)
    settings_path = data_dir / "connection.json"
    if settings_path.exists():
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
        if type(settings.get("port")) is not int or not 1024 <= settings["port"] <= 65535:
            raise ValueError("Existing connection.json has an invalid port.")
        if not isinstance(settings.get("token"), str) or len(settings["token"]) < 32:
            raise ValueError("Existing connection.json has an invalid token.")
        if port is not None and port != settings["port"]:
            raise ValueError("The existing installation uses a different port. Use a new data directory to change it.")
    else:
        settings = {"port": port if port is not None else 28746, "token": secrets.token_urlsafe(32)}
        if type(settings["port"]) is not int or not 1024 <= settings["port"] <= 65535:
            raise ValueError("Port must be between 1024 and 65535.")
        atomic_write(settings_path, (json.dumps(settings) + "\n").encode("utf-8"))

    connection = (
        "const BRIDGE_URL = " + json.dumps(f'http://127.0.0.1:{settings["port"]}') + ";\n"
        "const BRIDGE_TOKEN = " + json.dumps(settings["token"]) + ";\n"
    )
    descriptor, temporary = tempfile.mkstemp(prefix=".addon-", dir=data_dir)
    os.close(descriptor)
    addon = data_dir / "Thunderbird-Mail-MCP.xpi"
    try:
        with ZipFile(temporary, "w", ZIP_DEFLATED) as archive:
            for filename in ("manifest.json", "background.js"):
                archive.write(SOURCE / "extension" / filename, filename)
            archive.writestr("connection.js", connection)
        os.replace(temporary, addon)
    finally:
        Path(temporary).unlink(missing_ok=True)

    bridge = data_dir / "bridge.py"
    atomic_write(bridge, (SOURCE / "bridge.py").read_bytes())
    config = (
        "[mcp_servers.thunderbird-mail]\n"
        f"command = {json.dumps(sys.executable)}\n"
        f"args = {json.dumps(['-u', str(bridge)])}\n"
        "startup_timeout_sec = 20\n"
        "tool_timeout_sec = 60\n"
    )
    config_path = data_dir / "codex-mcp.toml"
    atomic_write(config_path, config.encode("utf-8"))
    return addon, config_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=default_data_dir())
    parser.add_argument("--port", type=int, help="Local port for a new installation (default 28746)")
    args = parser.parse_args()
    try:
        addon, config = install(args.data_dir, args.port)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Setup failed / Kurulum başarısız: {error}\n")
    print("Personal installation ready / Kişisel kurulum hazır")
    print(f"Thunderbird add-on / Thunderbird eklentisi: {addon}")
    print(f"Codex configuration / Codex yapılandırması: {config}")
    print("Follow README.md or docs/README.tr.md to install the add-on and connect Codex.")


if __name__ == "__main__":
    main()
