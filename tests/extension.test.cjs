const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const folder = { accountId: "account-test", name: "Inbox", specialUse: ["inbox"] };
  const common = {
    date: new Date("2026-01-10T12:00:00Z"),
    folder,
    read: false,
    subject: "Synthetic message",
    author: "sender@example.test",
    headerMessageId: "synthetic@example.test",
  };
  const messages = new Map([
    [1, { ...common, id: 1 }],
    [2, { ...common, id: 2, folder: { ...folder, name: "Drafts", specialUse: ["drafts"] } }],
    [3, { ...common, id: 3, date: new Date("2026-01-09T12:00:00Z") }],
    [4, { ...common, id: 4 }],
    [5, { ...common, id: 5, read: true }],
    [6, { ...common, id: 6, folder: { ...folder, name: "Archive", path: "/Sent/Archive" } }],
    [7, { ...common, id: 7 }],
  ]);
  const updates = [];
  const drafts = [];
  const queries = [];
  const messenger = {
    runtime: { getManifest: () => ({ version: "1.1" }) },
    accounts: {
      list: async () => [{
        id: "account-test", name: "Synthetic mailbox", type: "imap",
        identities: [{ id: "identity-test", email: "sender@example.test" }],
      }],
    },
    messages: {
      get: async id => ({ ...messages.get(id) }),
      update: async (id, properties) => {
        assert.equal(JSON.stringify(properties), '{"read":true}');
        if (id === 7) throw Error("Synthetic unavailable message");
        updates.push(id);
        messages.get(id).read = true;
      },
      query: async query => {
        queries.push(query);
        return {
          messages: [...messages.values()].filter(message =>
            query.unread !== true || message.read === false),
        };
      },
      getFull: async () => ({ contentType: "text/plain", body: "Synthetic body" }),
      listAttachments: async () => [{ name: "synthetic.txt", contentType: "text/plain", size: 14 }],
    },
    compose: {
      beginNew: async details => { drafts.push(details); return { id: 10 }; },
      getComposeDetails: async () => ({ to: ["recipient@example.test"], subject: "Synthetic draft" }),
      listAttachments: async () => [],
    },
  };
  const source = fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8")
    .replace(/\npoll\(\);\s*$/, "\nglobalThis.api = { handlers, publicHeader };");
  const context = { messenger };
  vm.runInNewContext(source, context);
  return { ...context.api, messages, updates, drafts, queries };
}

test("mark_read verifies identity, cutoff and outgoing folders, and reports partial failures", async () => {
  const f = fixture();
  const selected = [...f.messages.values()].map(message => ({
    id: message.id, key: f.publicHeader(message, new Map()).key,
  }));
  selected.find(message => message.id === 4).key = "stale-identity";
  const results = await f.handlers.mark_read({ messages: selected, since: "2026-01-10T00:00:00Z" });
  assert.deepEqual(Array.from(results, row => row.status), [
    "marked_read", "skipped", "skipped", "skipped", "already_read", "skipped", "error",
  ]);
  assert.deepEqual(f.updates, [1]);
  const retry = await f.handlers.mark_read({ messages: selected.slice(0, 1) });
  assert.equal(retry[0].status, "already_read");
  await assert.rejects(f.handlers.mark_read({ messages: selected, since: "invalid" }));
});

test("search uses the Manifest V2 unread property and preserves the include-read option", async () => {
  const f = fixture();
  const unread = await f.handlers.search_messages({});
  assert.equal(f.queries[0].unread, true);
  assert.equal(Object.hasOwn(f.queries[0], "read"), false);
  assert.equal(unread.some(row => row.id === 2 || row.id === 6), false);
  const all = await f.handlers.search_messages({ unread: false, include_other_folders: true });
  assert.equal(all.length, 7);
  assert.equal(all.some(row => row.id === 5), true);
});

test("reading returns text and attachment metadata without changing read status", async () => {
  const f = fixture();
  const [message] = await f.handlers.read_messages({ ids: [1] });
  assert.equal(message.body, "Synthetic body");
  assert.equal(message.attachments[0].name, "synthetic.txt");
  assert.equal(f.messages.get(1).read, false);
  assert.deepEqual(f.updates, []);
});

test("a new draft selects the sender and opens for user review", async () => {
  const f = fixture();
  const result = await f.handlers.prepare_draft({
    kind: "new", identity_id: "identity-test",
    to: ["recipient@example.test"], subject: "Synthetic draft", body: "Synthetic body",
  });
  assert.equal(result.status, "open_for_review_in_thunderbird");
  assert.equal(f.drafts[0].identityId, "identity-test");
  await assert.rejects(f.handlers.prepare_draft({ kind: "new", identity_id: "unknown" }));
});
