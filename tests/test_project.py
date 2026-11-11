import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    specification = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


setup = load_module("project_setup", ROOT / "setup.py")


def load_bridge():
    fixture = json.dumps({"port": 28746, "token": "synthetic-bridge-key-for-isolated-tests"})
    with patch.object(Path, "read_text", return_value=fixture):
        return load_module("test_bridge", ROOT / "bridge.py")


class SetupTests(unittest.TestCase):
    def test_private_package_and_repeat_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / "personal-installation"
            addon, config = setup.install(folder, 28747)
            original = (folder / "connection.json").read_bytes()
            (folder / "summaries.sqlite3").write_bytes(b"preserved-history")
            with ZipFile(addon) as archive:
                self.assertEqual(set(archive.namelist()), {"manifest.json", "background.js", "connection.js"})
                self.assertIsNone(archive.testzip())
                settings = json.loads(original)
                script = archive.read("connection.js").decode()
                self.assertIn(json.dumps(settings["token"]), script)
                self.assertIn("127.0.0.1:28747", script)
            text = config.read_text(encoding="utf-8")
            self.assertIn(json.dumps(str(folder / "bridge.py")), text)
            self.assertNotIn(settings["token"], text)
            setup.install(folder)
            self.assertEqual((folder / "connection.json").read_bytes(), original)
            self.assertEqual((folder / "summaries.sqlite3").read_bytes(), b"preserved-history")
            with self.assertRaises(ValueError):
                setup.install(folder, 28748)

    def test_new_installations_have_distinct_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first"
            second = Path(directory) / "second"
            setup.install(first)
            setup.install(second)
            self.assertNotEqual(
                json.loads((first / "connection.json").read_text())["token"],
                json.loads((second / "connection.json").read_text())["token"],
            )

    def test_source_directory_and_invalid_port_are_rejected(self):
        with self.assertRaises(ValueError):
            setup.install(ROOT)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                setup.install(Path(directory), 80)
            self.assertFalse((Path(directory) / "connection.json").exists())


class MCPTests(unittest.TestCase):
    def setUp(self):
        self.bridge = load_bridge()
        self.temporary = tempfile.TemporaryDirectory()
        self.bridge.HOME = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)

    def test_pagination_and_summary_history_remain_separate(self):
        records = [{"id": 1, "key": "synthetic-key-one", "unread": True},
                   {"id": 2, "key": "synthetic-key-two", "unread": True}]
        self.bridge.local_request = lambda *_: {"result": records}
        first = self.bridge.call_tool({"name": "search_messages", "arguments": {"limit": 1}})
        self.assertEqual((first["total"], first["next_offset"]), (2, 1))
        self.assertEqual(first["messages"], records[:1])
        self.bridge.call_tool({"name": "remember_summarized", "arguments": {"keys": [records[0]["key"]]}})
        remaining = self.bridge.call_tool({"name": "search_messages", "arguments": {"new_only": True}})
        self.assertEqual(remaining["messages"], records[1:])
        self.assertTrue(all(record["unread"] for record in records))
        database = (self.bridge.HOME / "summaries.sqlite3").read_bytes()
        self.assertNotIn(b"synthetic-key-one", database)

    def test_mark_read_schema_requires_identity_and_non_boolean_ids(self):
        for arguments in ({}, {"messages": []}, {"messages": [{"id": 1}]},
                          {"messages": [{"id": True, "key": "synthetic"}]}):
            response = self.bridge.process({
                "id": 1, "method": "tools/call",
                "params": {"name": "mark_read", "arguments": arguments},
            })
            self.assertTrue(response["result"]["isError"])
        names = {tool["name"] for tool in self.bridge.TOOLS}
        self.assertEqual(len(names), 7)
        self.assertFalse(self.bridge.TOOL_BY_NAME["mark_read"]["annotations"]["readOnlyHint"])
        self.assertIsNone(self.bridge.process({"method": "notifications/initialized"}))


class LocalHTTPTests(unittest.TestCase):
    def test_authentication_and_tool_validation(self):
        bridge = load_bridge()
        bridge.BROKER.invoke = lambda name, args: {"name": name, "arguments": args}
        server = ThreadingHTTPServer(("127.0.0.1", 0), bridge.LocalServer)
        bridge.ADDRESS = f"127.0.0.1:{server.server_address[1]}"
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

            def post(body, authorization=bridge.AUTH):
                request = urllib.request.Request(
                    f"http://{bridge.ADDRESS}/invoke",
                    data=json.dumps(body).encode(),
                    headers={"Authorization": authorization, "Content-Type": "application/json"},
                )
                with opener.open(request, timeout=3) as response:
                    return json.load(response)

            with self.assertRaises(urllib.error.HTTPError) as rejected:
                post({"name": "status", "arguments": {}}, authorization="Bearer wrong")
            self.assertEqual(rejected.exception.code, 403)
            self.assertEqual(post({"name": "status", "arguments": {}})["result"]["name"], "status")
            self.assertIn("error", post({"name": "mark_read", "arguments": {}}))
            self.assertIn("error", post({"name": "unknown", "arguments": {}}))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
