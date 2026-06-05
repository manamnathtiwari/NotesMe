const PREFIX = "notesme:v1:";
const SETTINGS_KEY = `${PREFIX}settings`;
const INDEX_KEY = `${PREFIX}__index`;
const SYNC_META_KEY = `${PREFIX}sync:meta`;
const SYNC_SETTINGS_KEY = `${PREFIX}sync:settings`;
const SYNC_INDEX_KEY = `${PREFIX}sync:index`;
const SYNC_PAGE_PREFIX = `${PREFIX}sync:page:`;
const SYNC_ALARM = "notesme-sync-alarm";
const CONFLICT_LOG_KEY = `${PREFIX}sync:conflicts`;

function now() {
  return Date.now();
}

function isPageKey(key) {
  return key.startsWith(PREFIX) && key !== SETTINGS_KEY && key !== INDEX_KEY && !key.startsWith(SYNC_PAGE_PREFIX) && key !== SYNC_META_KEY && key !== SYNC_SETTINGS_KEY && key !== SYNC_INDEX_KEY;
}

function safeJsonSize(obj) {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

async function getLocalAll() {
  return chrome.storage.local.get(null);
}

async function getSyncAll() {
  return chrome.storage.sync.get(null);
}

async function getSyncMode() {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = res[SETTINGS_KEY] || {};
  return settings.syncMode === "metadata" || settings.syncMode === "full" ? settings.syncMode : "off";
}

async function getConflictPolicy() {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = res[SETTINGS_KEY] || {};
  const policy = settings.conflictPolicy;
  return policy === "local" || policy === "remote" ? policy : "newest";
}

async function appendConflictLog(entry) {
  const res = await chrome.storage.local.get(CONFLICT_LOG_KEY);
  const list = Array.isArray(res[CONFLICT_LOG_KEY]) ? res[CONFLICT_LOG_KEY] : [];
  list.push({
    ...entry,
    at: now(),
  });
  const next = list.slice(-100);
  await chrome.storage.local.set({ [CONFLICT_LOG_KEY]: next });
}

function pickNewestByTimestamp(localObj, syncObj, tsField = "updatedAt") {
  const localTs = localObj && Number(localObj[tsField]) ? Number(localObj[tsField]) : 0;
  const syncTs = syncObj && Number(syncObj[tsField]) ? Number(syncObj[tsField]) : 0;
  return syncTs > localTs ? syncObj : localObj;
}

function mergeIndex(localIndex, syncIndex) {
  const base = { pages: {}, lastCleanupAt: 0, schemaVersion: 1, updatedAt: 0 };
  const local = { ...base, ...(localIndex || {}) };
  const remote = { ...base, ...(syncIndex || {}) };

  const merged = {
    pages: {},
    lastCleanupAt: Math.max(local.lastCleanupAt || 0, remote.lastCleanupAt || 0),
    schemaVersion: Math.max(local.schemaVersion || 1, remote.schemaVersion || 1),
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
  };

  const keys = new Set([...Object.keys(local.pages || {}), ...Object.keys(remote.pages || {})]);
  for (const key of keys) {
    const l = local.pages[key] || null;
    const r = remote.pages[key] || null;
    const lTs = l && Number(l.lastVisit) ? Number(l.lastVisit) : 0;
    const rTs = r && Number(r.lastVisit) ? Number(r.lastVisit) : 0;
    merged.pages[key] = rTs > lTs ? r : l;
  }

  merged.updatedAt = now();
  return merged;
}

async function pushToSync() {
  const mode = await getSyncMode();
  if (mode === "off") {
    return { ok: true, mode, pushedPages: 0, skippedOversize: 0 };
  }

  const localAll = await getLocalAll();
  const settings = { ...(localAll[SETTINGS_KEY] || {}) };
  settings.updatedAt = now();

  const index = { ...(localAll[INDEX_KEY] || { pages: {}, schemaVersion: 1 }) };
  index.updatedAt = now();

  const syncWrites = {
    [SYNC_SETTINGS_KEY]: settings,
    [SYNC_INDEX_KEY]: index,
    [SYNC_META_KEY]: {
      mode,
      updatedAt: now(),
    },
  };

  let pushedPages = 0;
  let skippedOversize = 0;

  if (mode === "full") {
    const pageEntries = Object.entries(localAll)
      .filter(([key]) => isPageKey(key))
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => ((b.value && b.value.lastVisit) || 0) - ((a.value && a.value.lastVisit) || 0))
      .slice(0, 20);

    for (const entry of pageEntries) {
      const payload = {
        pageKey: entry.value && entry.value.pageKey ? entry.value.pageKey : entry.key,
        lastVisit: (entry.value && entry.value.lastVisit) || now(),
        page: entry.value || {},
      };

      if (safeJsonSize(payload) > 7000) {
        skippedOversize += 1;
        continue;
      }

      const syncKey = `${SYNC_PAGE_PREFIX}${encodeURIComponent(entry.key)}`;
      syncWrites[syncKey] = payload;
      pushedPages += 1;
    }
  }

  await chrome.storage.sync.set(syncWrites);
  return { ok: true, mode, pushedPages, skippedOversize };
}

async function pullFromSync() {
  const mode = await getSyncMode();
  if (mode === "off") {
    return { ok: true, pulledPages: 0, skipped: "sync-off" };
  }

  const syncAll = await getSyncAll();
  const localAll = await getLocalAll();

  const localSettings = localAll[SETTINGS_KEY] || {};
  const syncSettings = syncAll[SYNC_SETTINGS_KEY] || null;
  const mergedSettings = pickNewestByTimestamp(localSettings, syncSettings, "updatedAt") || localSettings;

  const localIndex = localAll[INDEX_KEY] || { pages: {}, schemaVersion: 1 };
  const syncIndex = syncAll[SYNC_INDEX_KEY] || null;
  const mergedIndex = mergeIndex(localIndex, syncIndex);

  const writes = {
    [SETTINGS_KEY]: mergedSettings,
    [INDEX_KEY]: mergedIndex,
  };

  const policy = await getConflictPolicy();

  let pulledPages = 0;
  for (const [key, val] of Object.entries(syncAll)) {
    if (!key.startsWith(SYNC_PAGE_PREFIX) || !val || !val.page) {
      continue;
    }

    const localKeyEncoded = key.slice(SYNC_PAGE_PREFIX.length);
    const localKey = decodeURIComponent(localKeyEncoded);
    const localPage = localAll[localKey] || null;

    const syncTs = Number(val.lastVisit) || 0;
    const localTs = localPage && Number(localPage.lastVisit) ? Number(localPage.lastVisit) : 0;
    if (syncTs > 0 && localTs > 0 && syncTs !== localTs) {
      await appendConflictLog({
        key: localKey,
        reason: `ts-mismatch local=${localTs} sync=${syncTs}`,
      });
    }

    let shouldUseSync = false;
    if (policy === "remote") {
      shouldUseSync = syncTs > 0;
    } else if (policy === "local") {
      shouldUseSync = localTs === 0 && syncTs > 0;
    } else {
      shouldUseSync = syncTs > localTs;
    }

    if (shouldUseSync) {
      writes[localKey] = val.page;
      pulledPages += 1;
    }
  }

  await chrome.storage.local.set(writes);
  return { ok: true, pulledPages };
}

async function syncBothWays() {
  const mode = await getSyncMode();
  if (mode === "off") {
    return {
      ok: true,
      pullRes: { ok: true, pulledPages: 0, skipped: "sync-off" },
      pushRes: { ok: true, mode: "off", pushedPages: 0, skippedOversize: 0 },
    };
  }

  const pullRes = await pullFromSync();
  const pushRes = await pushToSync();
  return { ok: true, pullRes, pushRes };
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
    await syncBothWays();
  } catch (error) {
    console.error("NotesMe install sync setup failed", error);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
    await syncBothWays();
  } catch (error) {
    console.error("NotesMe startup sync setup failed", error);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm || alarm.name !== SYNC_ALARM) {
    return;
  }
  try {
    await syncBothWays();
  } catch (error) {
    console.error("NotesMe periodic sync failed", error);
  }
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  if (changes[SYNC_SETTINGS_KEY] || changes[SYNC_INDEX_KEY] || Object.keys(changes).some((key) => key.startsWith(SYNC_PAGE_PREFIX))) {
    try {
      const mode = await getSyncMode();
      if (mode === "off") {
        return;
      }
      await pullFromSync();
    } catch (error) {
      console.error("NotesMe sync change merge failed", error);
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "NOTESME_SYNC_NOW") {
    syncBothWays()
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((error) => sendResponse({ ok: false, reason: error && error.message ? error.message : "Sync failed" }));
    return true;
  }

  if (message.type === "NOTESME_SYNC_PULL") {
    pullFromSync()
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((error) => sendResponse({ ok: false, reason: error && error.message ? error.message : "Sync pull failed" }));
    return true;
  }

  if (message.type === "NOTESME_GET_CONFLICT_LOG") {
    chrome.storage.local.get(CONFLICT_LOG_KEY)
      .then((res) => sendResponse({ ok: true, logs: Array.isArray(res[CONFLICT_LOG_KEY]) ? res[CONFLICT_LOG_KEY] : [] }))
      .catch((error) => sendResponse({ ok: false, reason: error && error.message ? error.message : "Failed to read conflict log" }));
    return true;
  }

  if (message.type === "NOTESME_CLEAR_CONFLICT_LOG") {
    chrome.storage.local.remove(CONFLICT_LOG_KEY)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, reason: error && error.message ? error.message : "Failed to clear conflict log" }));
    return true;
  }

  return false;
});
