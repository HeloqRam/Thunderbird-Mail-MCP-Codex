# Thunderbird Mail MCP for Codex

[Türkçe kurulum ve kullanım](docs/README.tr.md)

Connect Codex to the mail accounts already configured in your local Thunderbird. Search messages, read their text, summarize unread mail, mark selected incoming messages as read, and prepare new, reply or forward drafts.

The project has two parts

- A Python MCP server that communicates with Codex over standard input/output.
- A Thunderbird MailExtension that polls an authenticated HTTP bridge on `127.0.0.1`.

The installer generates a fresh private connection key for each installation and packages a personal `.xpi` add-on. The Python server uses the standard library.

## Requirements

- Python **3.10 or later**, including SQLite support.
- Thunderbird **128 or later** with your accounts configured, synchronized and open during use.
- A local Codex client with support for stdio MCP servers.
- Permission to install a local Thunderbird add-on.

Windows is the environment used for the original live integration. The installer also selects standard macOS and Linux data directories. Those desktop integrations need validation on their respective systems.

## Installation

### 1. Download the source

Use GitHub's **Code → Download ZIP**, extract the ZIP and open a terminal inside the extracted project folder. Alternatively, clone the repository.

```sh
git clone https://github.com/HeloqRam/Thunderbird-Mail-MCP-Codex.git
cd Thunderbird-Mail-MCP-Codex
```

### 2. Generate your personal installation

On Windows, run

```powershell
py -3 setup.py
```

On macOS or Linux, run

```sh
python3 setup.py
```

The script prints the exact paths to your personal add-on and Codex configuration snippet. Files are generated outside the source repository.

| System | Default installation directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\ThunderbirdMailMCP` |
| macOS | `~/Library/Application Support/ThunderbirdMailMCP` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/thunderbird-mail-mcp` |

The directory contains `bridge.py`, `connection.json`, `Thunderbird-Mail-MCP.xpi` and `codex-mcp.toml`. A local `summaries.sqlite3` database is created when summary history is used.

For a custom directory or a different port, use

```powershell
py -3 setup.py --data-dir "C:\LocalTools\ThunderbirdMailMCP" --port 28747
```

Choose a private directory outside the source repository. Keep it in place after installation.

### 3. Install the add-on in Thunderbird

1. Open **Add-ons and Themes**.
2. Open the gear menu and choose **Install Add-on From File**.
3. Select the generated `Thunderbird-Mail-MCP.xpi` using the path printed by setup.
4. Review and approve the requested permissions.

The add-on uses `accountsRead` to list accounts, `messagesRead` to search and read messages, `messagesUpdate` to mark messages read, and `compose` to open drafts. It also needs access to the local HTTP bridge.

[Thunderbird's add-on installation guide](https://support.mozilla.org/en-US/kb/installing-addon-thunderbird)

### 4. Register the MCP server in Codex

Open the generated `codex-mcp.toml` in a text editor. Copy its complete `[mcp_servers.thunderbird-mail]` block into your Codex configuration file.

- Windows default location is `%USERPROFILE%\.codex\config.toml`.
- macOS and Linux default location is `~/.codex/config.toml`.
- A custom `CODEX_HOME` changes the configuration directory.

If that server section already exists, update it in place. Preserve the other sections in your configuration.

The generated snippet contains the absolute Python executable and bridge paths for your computer, with the necessary quoting. A generic example follows.

```toml
[mcp_servers.thunderbird-mail]
command = "C:/Python312/python.exe"
args = ["-u", "C:/LocalTools/ThunderbirdMailMCP/bridge.py"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

Completely restart your Codex client after saving the configuration. Keep Thunderbird running. Codex starts the Python bridge when it connects to the server.

[Official Codex MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp)

### 5. Test the connection

Ask Codex

> Check the Thunderbird MCP connection and list my mail accounts.

Then try

> Summarize new unread messages since yesterday. Include the sender, mailbox and date.

For a deliberate read-status update, ask

> Mark the incoming messages covered by this summary as read.

For an outgoing message, ask

> Prepare a draft to recipient@example.com with the subject Meeting and the body Can we meet tomorrow?

Review the draft in Thunderbird and click **Send** yourself.

## Available tools

| Tool | Purpose |
| --- | --- |
| `status` | Report add-on connectivity, account count and add-on version. |
| `list_accounts` | List configured accounts and sender identities. |
| `search_messages` | Search by account, sender, subject and message date, with pagination. |
| `read_messages` | Read message text and attachment names, types and sizes. Up to 8 IDs per call. |
| `mark_read` | Mark up to 25 selected incoming messages read and verify each result. |
| `remember_summarized` | Remember hashes of the message keys covered by a summary. |
| `prepare_draft` | Open a new, reply or forward draft with an explicitly selected sender identity. |

Search defaults to unread messages and excludes junk, trash, sent, outbox, drafts and templates. `unread=false` includes both read and unread messages. `include_other_folders=true` includes the excluded folders. Search results include the account, folder, sender, subject, message date, read status and a stable key.

Use `next_offset` until it is null. Use `new_only=true` to omit previously summarized messages, then record only keys actually covered by the summary. Summary history and Thunderbird's read status are separate.

`mark_read` requires the numeric `id` and matching `key` from a fresh search. When using a time range, pass the same `since` value. Each result reports `marked_read`, `already_read`, `skipped` or `error`. Verify partial results before retrying.

Dates use the message's Date field. A server arrival timestamp from the Received headers is outside this version's tools. Message text is limited to 12,000 characters, with `body_truncated` indicating longer bodies. Attachments are listed as metadata. Reading attachment contents and generating Excel files require additional tools in the client.

## Privacy and local data

Your mail accounts and passwords remain managed by Thunderbird. Setup generates a local bridge key and a personalized add-on. Treat both `connection.json` and the generated `.xpi` as private credentials.

The bridge listens on the loopback address, checks the Host and bearer key, and disables HTTP request logging. Mail text passes through the MCP tools to the AI client when requested, so the client's data handling policy applies. Summary history stores SHA-256 hashes of selected message keys.

This repository contains source code, documentation and tests with synthetic mail. Personal configuration, generated add-ons, mailbox profiles, mail exports, attachments and reports are excluded from version control.

## Updates

Download the updated source and run setup again with the **same data directory**. Existing connection settings and summary history are preserved. Reinstall the newly generated add-on in Thunderbird and restart Codex.

To change the port, create an installation in a different data directory using `--port`, then install its add-on and use its generated Codex snippet.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Python command is missing | Install Python 3.10+ and confirm `py -3 --version` or `python3 --version`. |
| MCP tool names are absent | Check the generated snippet, absolute paths and TOML syntax, then restart Codex. |
| Add-on is disconnected | Keep Thunderbird open, enable the add-on and confirm it was built with the same installation settings as the bridge. |
| Port is already in use | Stop the conflicting service or generate an installation with a different port. |
| Search omits folders | Use `include_other_folders=true` when those folders belong in the request. |
| A message cannot be read | Check account synchronization and message availability in Thunderbird. The tool returns an error for that ID. |
| A request times out | Check Thunderbird before retrying. A draft or read-status change may already have started. |

## Development

```sh
python -m unittest discover -s tests -p "test_*.py" -v
node --test tests/extension.test.cjs
```

The automated tests use synthetic mail and isolated temporary directories. Node.js 18+ is needed only for the extension tests.

## Project layout

```text
bridge.py                  Python stdio MCP server and authenticated local broker
setup.py                   Per-user configuration and add-on packaging
extension/manifest.json    Thunderbird permissions and background scripts
extension/background.js    Thunderbird mail operations and polling
docs/README.tr.md          Turkish installation and usage guide
tests/                    Synthetic setup, MCP and extension checks
```

[Thunderbird messages API reference](https://webextension-api.thunderbird.net/en/mv2/messages.html)
