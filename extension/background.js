const tb = messenger;
const excludedFolders = new Set(["trash", "junk", "drafts", "sent", "templates", "outbox"]);
const outgoingFolderUses = new Set(["drafts", "sent", "templates", "outbox"]);
const outgoingFolderNames = new Set([
  "drafts", "sent", "sent items", "sent messages", "outbox", "unsent messages", "templates",
  "taslaklar", "gönderilmiş", "gönderilmiş öğeler", "gönderilmiş iletiler", "giden kutusu", "şablonlar",
]);

function isOutgoingFolder(folder) {
  const uses = [...(folder.specialUse ?? []), folder.type];
  const names = [folder.name, ...(folder.path ?? "").split("/")];
  return uses.some(use => outgoingFolderUses.has(use)) ||
    names.some(name => outgoingFolderNames.has(name?.normalize().trim().toLowerCase()));
}

function publicHeader(message, accounts) {
  const accountId = message.folder?.accountId ?? "";
  return {
    id: message.id,
    key: JSON.stringify([accountId, message.headerMessageId || "", message.date, message.author, message.subject]),
    date: message.date,
    account: accounts.get(accountId) || accountId,
    folder: message.folder?.name,
    subject: message.subject,
    sender: message.author,
    unread: message.read === false,
  };
}

async function listAccounts() {
  const accounts = await tb.accounts.list(false);
  return accounts.map(({ id, name, type, identities }) => ({
    id, name, type,
    identities: (identities || []).map(({ id, name, email }) => ({ id, name, email })),
  }));
}

async function searchMessages(args) {
  const accounts = new Map((await listAccounts()).map(({ id, name }) => [id, name]));
  if (args.account_id && !accounts.has(args.account_id)) throw new Error("Posta hesabı bulunamadı.");
  const query = { messagesPerPage: 200 };
  if (args.unread !== false) query.unread = true;
  if (!args.include_other_folders) query.junk = false;
  if (args.account_id) query.accountId = args.account_id;
  if (args.subject) query.subject = args.subject;
  if (args.sender) query.author = args.sender;
  if (args.since) {
    query.fromDate = parseTimestamp(args.since);
  }
  const matches = [];
  let page = await tb.messages.query(query);
  for (;;) {
    for (const message of page.messages) {
      const uses = [...(message.folder?.specialUse ?? []), message.folder?.type];
      if (!args.include_other_folders &&
          (uses.some(use => excludedFolders.has(use)) || (message.folder && isOutgoingFolder(message.folder)))) continue;
      matches.push(publicHeader(message, accounts));
    }
    if (!page.id) break;
    page = await tb.messages.continueList(page.id);
  }
  return matches.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
}

function parseTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Tarih ISO 8601 biçiminde olmalı.");
  return date;
}

async function markRead({ messages, since }) {
  const cutoff = since === undefined ? undefined : parseTimestamp(since);
  const accounts = new Map((await listAccounts()).map(({ id, name }) => [id, name]));
  const results = [];
  for (const { id, key } of messages) {
    try {
      const message = await tb.messages.get(id);
      const header = publicHeader(message, accounts);
      if (header.key !== key || !message.folder || isOutgoingFolder(message.folder) ||
          (cutoff !== undefined && !(new Date(message.date) >= cutoff))) {
        results.push({ id, status: "skipped" });
        continue;
      }
      if (message.read === true) {
        results.push({ ...header, status: "already_read" });
        continue;
      }
      await tb.messages.update(id, { read: true });
      const current = await tb.messages.get(id);
      const updated = publicHeader(current, accounts);
      if (updated.key !== key || current.read !== true) throw new Error("Okundu durumu doğrulanamadı.");
      results.push({ ...updated, status: "marked_read" });
    } catch (error) {
      results.push({ id, status: "error", error: String(error.message || error) });
    }
  }
  return results;
}

function extractText(part) {
  if (part.name || part.headers?.["content-disposition"]?.some(value => /^attachment\b/i.test(value))) return "";
  const type = part.contentType?.split(";")[0].toLowerCase();
  if (typeof part.body === "string") {
    if (type === "text/plain") return part.body;
    if (type === "text/html") {
      const template = document.createElement("template");
      template.innerHTML = part.body;
      for (const node of template.content.querySelectorAll("style,script,template,head")) node.remove();
      for (const node of template.content.querySelectorAll("br,p,div,tr,li")) node.append("\n");
      return template.content.textContent || "";
    }
  }
  const children = part.parts || [];
  if (type === "multipart/alternative") {
    const plain = children.find(child => child.contentType?.startsWith("text/plain"));
    if (plain) return extractText(plain);
    return children.map(extractText).find(Boolean) || "";
  }
  return children.map(extractText).filter(Boolean).join("\n");
}

async function readMessages(ids) {
  const accounts = new Map((await listAccounts()).map(({ id, name }) => [id, name]));
  const result = [];
  for (const id of ids) {
    try {
      const message = await tb.messages.get(id);
      const full = await tb.messages.getFull(id);
      const text = extractText(full).trim();
      const attachments = await tb.messages.listAttachments(id);
      result.push({
        ...publicHeader(message, accounts),
        body: text.slice(0, 12000),
        body_truncated: text.length > 12000,
        attachments: attachments.map(({ name, contentType, size }) => ({ name, contentType, size })),
      });
    } catch (error) {
      result.push({ id, error: String(error.message || error) });
    }
  }
  return result;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function prepareDraft(args) {
  const accounts = await listAccounts();
  const identity = accounts.flatMap(account => account.identities).find(item => item.id === args.identity_id);
  if (!identity) throw new Error("Geçerli bir gönderici kimliği seç.");
  const details = { identityId: identity.id };
  for (const field of ["to", "cc", "bcc"]) {
    if (args[field]) details[field] = args[field];
  }

  let tab;
  if (args.kind === "new") {
    if (!args.to?.length || typeof args.subject !== "string" || typeof args.body !== "string") {
      throw new Error("Yeni ileti için alıcı, konu ve metin gerekli.");
    }
    tab = await tb.compose.beginNew({ ...details, subject: args.subject, plainTextBody: args.body, isPlainText: true });
  } else {
    if (!Number.isInteger(args.message_id)) throw new Error("Kaynak ileti kimliği gerekli.");
    if (args.kind === "forward") {
      if (!args.to?.length) throw new Error("İletme için alıcı gerekli.");
      tab = await tb.compose.beginForward(args.message_id, "forwardInline", details);
    } else if (args.kind === "reply") {
      tab = await tb.compose.beginReply(args.message_id, args.reply_all ? "replyToAll" : "replyToSender", details);
    } else {
      throw new Error("Geçersiz taslak türü.");
    }
    if (args.body) {
      const current = await tb.compose.getComposeDetails(tab.id);
      const changes = current.isPlainText
        ? { plainTextBody: args.body + "\n\n" + (current.plainTextBody || "") }
        : { body: "<div>" + escapeHtml(args.body).replaceAll("\n", "<br>") + "</div><br>" + (current.body || "") };
      await tb.compose.setComposeDetails(tab.id, changes);
    }
  }
  const preview = await tb.compose.getComposeDetails(tab.id);
  const attachments = await tb.compose.listAttachments(tab.id);
  return {
    status: "open_for_review_in_thunderbird",
    sender: identity.email,
    to: preview.to,
    cc: preview.cc,
    bcc: preview.bcc,
    subject: preview.subject,
    attachments: attachments.map(({ name, size }) => ({ name, size })),
  };
}

const handlers = {
  status: async () => ({ connected: true, accounts: (await listAccounts()).length, version: tb.runtime.getManifest().version }),
  list_accounts: listAccounts,
  search_messages: searchMessages,
  read_messages: ({ ids }) => readMessages(ids),
  mark_read: markRead,
  prepare_draft: prepareDraft,
};

async function request(path, body) {
  const response = await fetch(BRIDGE_URL + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + BRIDGE_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("Local bridge unavailable.");
  return response.json();
}

async function poll() {
  let delay = 650;
  try {
    const job = await request("/next", {});
    if (job.id) {
      let response;
      try {
        if (!Object.hasOwn(handlers, job.method)) throw new Error("Unsupported mail operation.");
        response = { result: await handlers[job.method](job.args) };
      } catch (error) {
        response = { error: String(error.message || error) };
      }
      await request("/complete", { id: job.id, ...response });
      delay = 0;
    }
  } catch {
    delay = 2500;
  } finally {
    setTimeout(poll, delay);
  }
}

poll();
