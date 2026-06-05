function setStatus(text, kind = "") {
  const statusEl = document.getElementById("status");
  if (!statusEl) {
    return;
  }
  statusEl.textContent = text || "";
  statusEl.className = "status";
  if (kind) {
    statusEl.classList.add(kind);
  }
}

const INDEX_KEY = "notesme:v1:__index";
const CONFLICT_LOG_KEY = "notesme:v1:sync:conflicts";
const SELFTEST_KEY = "notesme:v1:selftest";

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isRestrictedUrl(url) {
  if (!url) {
    return true;
  }
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("view-source:") ||
    url.startsWith("https://chrome.google.com/webstore")
  );
}

async function ensureInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "NOTESME_PING" });
    return;
  } catch {
    // No receiver yet, try to inject content assets.
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function sendAction(message, successText = "Done") {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    setStatus("No active tab found", "error");
    return;
  }

  if (isRestrictedUrl(tab.url)) {
    setStatus("This page is restricted. Open a normal website and try again.", "error");
    return;
  }

  try {
    await ensureInjected(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, message);
    if (response && response.ok === false) {
      setStatus(response.reason || "Action could not be completed", "error");
      return;
    }
    setStatus((response && response.message) || successText, "ok");
    return response;
  } catch (error) {
    console.error("NotesMe action failed", error);
    setStatus("Could not run on this page. Refresh tab and try again.", "error");
    return null;
  }
}

const SETTINGS_KEY = "notesme:v1:settings";
const DEFAULT_SETTINGS = {
  keyMode: "smart",
  favorites: {},
  syncMode: "off",
  conflictPolicy: "newest",
  restoreSession: true,
  siteKeyingProfiles: {},
  updatedAt: 0,
};

let currentPageInfo = null;

document.getElementById("toggleToolbar").addEventListener("click", () => {
  sendAction({ type: "NOTESME_TOGGLE_TOOLBAR" }, "Toolbar toggled");
});

function setHighlightButtonState(enabled) {
  const btn = document.getElementById("highlightNow");
  if (!btn) {
    return;
  }
  btn.textContent = enabled ? "Highlight Mode: ON" : "Highlight Mode: OFF";
}

document.getElementById("highlightNow").addEventListener("click", async () => {
  const response = await sendAction({ type: "NOTESME_HIGHLIGHT" }, "Highlight mode toggled");
  if (response && response.ok) {
    setHighlightButtonState(!!response.highlightMode);
  }
});

document.getElementById("toggleDraw").addEventListener("click", () => {
  sendAction({ type: "NOTESME_TOGGLE_DRAW" }, "Draw mode toggled");
});

document.getElementById("toggleTextNoteMode").addEventListener("click", () => {
  sendAction({ type: "NOTESME_TOGGLE_TEXT_NOTE_MODE" }, "Place note mode toggled");
});

document.getElementById("clearPage").addEventListener("click", () => {
  sendAction({ type: "NOTESME_CLEAR" }, "Page cleared");
});

document.getElementById("toggleSidebar").addEventListener("click", () => {
  sendAction({ type: "NOTESME_TOGGLE_SIDEBAR" }, "Sidebar toggled");
});

function escapeHtml(value) {
  const str = String(value || "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadRawSettings() {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] || {}) };
}

async function saveSettings(settings) {
  settings.updatedAt = Date.now();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function renderFavoriteButton(isFavorite) {
  const btn = document.getElementById("toggleFavorite");
  if (!btn) return;
  btn.textContent = isFavorite ? "Unfavorite Current Page" : "Favorite Current Page";
}

document.getElementById("toggleFavorite").addEventListener("click", async () => {
  if (!currentPageInfo || !currentPageInfo.pageKey) {
    setStatus("Open a normal page first", "error");
    return;
  }

  try {
    const settings = await loadRawSettings();
    const favorites = { ...(settings.favorites || {}) };
    if (favorites[currentPageInfo.pageKey]) {
      delete favorites[currentPageInfo.pageKey];
      setStatus("Removed from favorites", "ok");
    } else {
      favorites[currentPageInfo.pageKey] = {
        pageTitle: currentPageInfo.pageTitle || "Untitled",
        pageUrl: currentPageInfo.pageUrl || "",
        savedAt: Date.now(),
      };
      setStatus("Added to favorites", "ok");
    }
    settings.favorites = favorites;
    await saveSettings(settings);
    renderFavoriteButton(!!favorites[currentPageInfo.pageKey]);
    await loadRecentPages();
  } catch (error) {
    console.error("NotesMe favorite toggle failed", error);
    setStatus("Could not update favorite", "error");
  }
});

async function loadSettings() {
  try {
    const settings = await loadRawSettings();
    const keyModeEl = document.getElementById("keyMode");
    if (keyModeEl) {
      keyModeEl.value = settings.keyMode;
    }
    const syncModeEl = document.getElementById("syncMode");
    if (syncModeEl) {
      syncModeEl.value = settings.syncMode || "off";
    }
    const restoreEl = document.getElementById("restoreSession");
    if (restoreEl) {
      restoreEl.value = settings.restoreSession === false ? "off" : "on";
    }
    const conflictEl = document.getElementById("conflictPolicy");
    if (conflictEl) {
      conflictEl.value = ["newest", "local", "remote"].includes(settings.conflictPolicy) ? settings.conflictPolicy : "newest";
    }
  } catch (error) {
    console.error("NotesMe settings load failed", error);
  }
}

document.getElementById("keyMode").addEventListener("change", async (event) => {
  const value = event.target.value === "path" ? "path" : "smart";
  try {
    const settings = await loadRawSettings();
    settings.keyMode = value;
    await saveSettings(settings);
    sendAction({ type: "NOTESME_REFRESH_KEYING" }, "Key mode updated");
  } catch (error) {
    console.error("NotesMe settings save failed", error);
    setStatus("Failed to save setting", "error");
  }
});

document.getElementById("syncMode").addEventListener("change", async (event) => {
  const value = ["off", "metadata", "full"].includes(event.target.value) ? event.target.value : "off";
  try {
    const settings = await loadRawSettings();
    settings.syncMode = value;
    await saveSettings(settings);
    setStatus(`Sync mode set to ${value}`, "ok");
  } catch (error) {
    console.error("NotesMe sync mode save failed", error);
    setStatus("Failed to save sync mode", "error");
  }
});

document.getElementById("conflictPolicy").addEventListener("change", async (event) => {
  const value = ["newest", "local", "remote"].includes(event.target.value) ? event.target.value : "newest";
  try {
    const settings = await loadRawSettings();
    settings.conflictPolicy = value;
    await saveSettings(settings);
    setStatus(`Conflict policy set to ${value}`, "ok");
  } catch (error) {
    console.error("NotesMe conflict policy save failed", error);
    setStatus("Failed to save conflict policy", "error");
  }
});

document.getElementById("restoreSession").addEventListener("change", async (event) => {
  const value = event.target.value === "off" ? false : true;
  try {
    const settings = await loadRawSettings();
    settings.restoreSession = value;
    await saveSettings(settings);
    setStatus(`Session restore ${value ? "enabled" : "disabled"}`, "ok");
  } catch (error) {
    console.error("NotesMe restore session save failed", error);
    setStatus("Failed to save restore setting", "error");
  }
});

document.getElementById("pathModeForSite").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    setStatus("No active page", "error");
    return;
  }
  try {
    const host = new URL(tab.url).hostname;
    const settings = await loadRawSettings();
    settings.siteKeyingProfiles = { ...(settings.siteKeyingProfiles || {}), [host]: "path" };
    await saveSettings(settings);
    await sendAction({ type: "NOTESME_REFRESH_KEYING" }, `Path keying enabled for ${host}`);
  } catch (error) {
    console.error("NotesMe site profile update failed", error);
    setStatus("Could not set site key profile", "error");
  }
});

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 120000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(bytes) {
  let binary = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function fromBase64(str) {
  const binary = atob(str);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function encryptJsonObject(obj, passphrase) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return {
    encrypted: true,
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iter: 120000,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(cipher),
  };
}

async function decryptJsonObject(payload, passphrase) {
  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const data = fromBase64(payload.data);
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  const txt = new TextDecoder().decode(plain);
  return JSON.parse(txt);
}

document.getElementById("syncNow").addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "NOTESME_SYNC_NOW" });
    if (!response || response.ok === false) {
      setStatus((response && response.reason) || "Sync failed", "error");
      return;
    }
    const pushed = response.pushRes && Number(response.pushRes.pushedPages) ? Number(response.pushRes.pushedPages) : 0;
    const pulled = response.pullRes && Number(response.pullRes.pulledPages) ? Number(response.pullRes.pulledPages) : 0;
    const skipped = response.pushRes && Number(response.pushRes.skippedOversize) ? Number(response.pushRes.skippedOversize) : 0;
    setStatus(`Synced: pulled ${pulled}, pushed ${pushed}, skipped ${skipped}`, "ok");
    await loadRecentPages();
  } catch (error) {
    console.error("NotesMe sync now failed", error);
    setStatus("Sync failed", "error");
  }
});

document.getElementById("syncPull").addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "NOTESME_SYNC_PULL" });
    if (!response || response.ok === false) {
      setStatus((response && response.reason) || "Pull failed", "error");
      return;
    }
    const pulled = Number(response.pulledPages || 0);
    setStatus(`Pulled ${pulled} updated page(s)`, "ok");
    await loadRecentPages();
    await runGlobalSearch(document.getElementById("globalSearch").value || "");
  } catch (error) {
    console.error("NotesMe sync pull failed", error);
    setStatus("Pull failed", "error");
  }
});

// -------------------------
// Storage usage display
// -------------------------
const STORAGE_QUOTA = 5 * 1024 * 1024; // 5 MB default chrome.storage.local quota

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function loadStorageInfo() {
  try {
    const used = await chrome.storage.local.getBytesInUse(null);
    const pct = Math.min(100, (used / STORAGE_QUOTA) * 100);
    document.getElementById("storageUsed").textContent = `${formatBytes(used)} / 5 MB`;
    document.getElementById("storageBarFill").style.width = `${pct.toFixed(1)}%`;
    document.getElementById("storageBarFill").style.background = pct > 80 ? "#b91c1c" : "#0f766e";
  } catch {
    document.getElementById("storageUsed").textContent = "unavailable";
  }
}

async function loadPageState() {
  const tab = await getActiveTab();
  if (!tab || !tab.id || isRestrictedUrl(tab.url)) {
    setHighlightButtonState(false);
    return;
  }

  try {
    await ensureInjected(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { type: "NOTESME_GET_STATE" });
    setHighlightButtonState(!!(response && response.highlightMode));
    currentPageInfo = response || null;

    const settings = await loadRawSettings();
    renderFavoriteButton(!!(currentPageInfo && currentPageInfo.pageKey && settings.favorites && settings.favorites[currentPageInfo.pageKey]));
  } catch {
    setHighlightButtonState(false);
    renderFavoriteButton(false);
  }
}

async function exportAllData() {
  const all = await chrome.storage.local.get(null);
  let payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    data: all,
  };

  const password = (document.getElementById("exportPassword").value || "").trim();
  if (password) {
    const encrypted = await encryptJsonObject(payload.data, password);
    payload = {
      exportedAt: payload.exportedAt,
      version: 2,
      encrypted,
    };
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  a.href = url;
  a.download = `notesme-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importAllData(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  let data = parsed && parsed.data && typeof parsed.data === "object" ? parsed.data : null;
  if (!data && parsed && parsed.encrypted && parsed.version === 2) {
    const password = (document.getElementById("importPassword").value || "").trim();
    if (!password) {
      throw new Error("Password required for encrypted backup");
    }
    data = await decryptJsonObject(parsed.encrypted, password);
  }
  if (!data) {
    throw new Error("Invalid import file");
  }
  await chrome.storage.local.set(data);
}

document.getElementById("exportData").addEventListener("click", async () => {
  try {
    await exportAllData();
    setStatus("Export complete", "ok");
  } catch (error) {
    console.error("NotesMe export failed", error);
    setStatus("Export failed", "error");
  }
});

document.getElementById("importData").addEventListener("click", () => {
  const input = document.getElementById("importFile");
  if (input) {
    input.value = "";
    input.click();
  }
});

document.getElementById("importFile").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }
  try {
    await importAllData(file);
    await loadStorageInfo();
    await loadRecentPages();
    await runGlobalSearch(document.getElementById("globalSearch").value || "");
    setStatus("Import complete", "ok");
  } catch (error) {
    console.error("NotesMe import failed", error);
    setStatus("Import failed: invalid file", "error");
  }
});

async function readAllPages() {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([key, value]) => key.startsWith("notesme:v1:") && key !== INDEX_KEY && key !== SETTINGS_KEY && value && typeof value === "object")
    .map(([key, value]) => ({ key, value }));
}

async function runGlobalSearch(query) {
  const root = document.getElementById("searchResults");
  if (!root) return;

  const term = (query || "").trim().toLowerCase();
  if (!term) {
    root.innerHTML = '<div class="list-item muted">Type to search highlights and notes across all pages.</div>';
    return;
  }

  const pages = await readAllPages();
  const hits = [];
  for (const page of pages) {
    const payload = page.value || {};
    const title = payload.pageKey || "Untitled page";
    const highlights = Array.isArray(payload.highlights) ? payload.highlights : [];
    const notes = Array.isArray(payload.textNotes) ? payload.textNotes : [];

    for (const h of highlights) {
      if ((h.text && h.text.toLowerCase().includes(term)) || (h.note && h.note.toLowerCase().includes(term))) {
        hits.push({
          title,
          text: h.text || "",
          note: h.note || "",
        });
      }
    }

    for (const n of notes) {
      if (n.text && n.text.toLowerCase().includes(term)) {
        hits.push({
          title,
          text: n.text,
          note: "",
        });
      }
    }
  }

  if (!hits.length) {
    root.innerHTML = '<div class="list-item muted">No matches found.</div>';
    return;
  }

  root.innerHTML = hits.slice(0, 25).map((hit) => {
    const preview = hit.text.length > 120 ? `${hit.text.slice(0, 120)}...` : hit.text;
    const note = hit.note ? `<div class="muted">${escapeHtml(hit.note)}</div>` : "";
    return `<div class="list-item"><div><strong>${escapeHtml(hit.title)}</strong></div><div>${escapeHtml(preview)}</div>${note}</div>`;
  }).join("");
}

async function loadRecentPages() {
  const root = document.getElementById("recentPages");
  if (!root) return;

  const [indexRes, settings] = await Promise.all([
    chrome.storage.local.get(INDEX_KEY),
    loadRawSettings(),
  ]);

  const index = indexRes[INDEX_KEY];
  const pages = index && index.pages && typeof index.pages === "object" ? Object.values(index.pages) : [];
  const favorites = settings.favorites || {};
  const favoriteKeys = new Set(Object.keys(favorites));

  if (!pages.length && !favoriteKeys.size) {
    root.innerHTML = '<div class="list-item muted">No recent pages yet.</div>';
    return;
  }

  const merged = [];
  for (const key of favoriteKeys) {
    const fav = favorites[key];
    merged.push({
      pageKey: key,
      title: (fav && fav.pageTitle) || "Favorite",
      url: (fav && fav.pageUrl) || "",
      lastVisit: (fav && fav.savedAt) || 0,
      favorite: true,
    });
  }

  for (const page of pages) {
    if (!page || !page.pageKey) {
      continue;
    }
    const existing = merged.find((m) => m.pageKey === page.pageKey);
    if (existing) {
      existing.lastVisit = Math.max(existing.lastVisit || 0, page.lastVisit || 0);
      existing.url = existing.url || page.url || "";
      existing.title = existing.title || page.title || page.pageKey;
      continue;
    }
    merged.push({
      pageKey: page.pageKey,
      title: page.title || page.pageKey,
      url: page.url || "",
      lastVisit: page.lastVisit || 0,
      favorite: false,
    });
  }

  merged.sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0));

  root.innerHTML = merged.slice(0, 12).map((page) => {
    const star = page.favorite ? "★ " : "";
    const title = escapeHtml(`${star}${page.title || page.pageKey}`);
    const url = escapeHtml(page.url || "");
    const link = page.url ? `<a href="${url}" target="_blank">Open</a>` : '<span class="muted">No URL</span>';
    return `<div class="list-item"><div><strong>${title}</strong></div><div class="muted">${escapeHtml(page.pageKey || "")}</div><div>${link}</div></div>`;
  }).join("");
}

async function loadStorageHealth() {
  const root = document.getElementById("storageHealth");
  if (!root) return;
  const pages = await readAllPages();
  if (!pages.length) {
    root.innerHTML = '<div class="list-item muted">No page data yet.</div>';
    return;
  }

  const stats = pages.map((p) => {
    const bytes = JSON.stringify(p.value || {}).length;
    const v = p.value || {};
    return {
      key: p.key,
      pageKey: v.pageKey || p.key,
      bytes,
      highlights: Array.isArray(v.highlights) ? v.highlights.length : 0,
      notes: Array.isArray(v.textNotes) ? v.textNotes.length : 0,
      strokes: Array.isArray(v.strokes) ? v.strokes.length : 0,
    };
  }).sort((a, b) => b.bytes - a.bytes).slice(0, 10);

  root.innerHTML = stats.map((s) => `<div class="list-item"><div><strong>${escapeHtml(s.pageKey)}</strong></div><div class="muted">${formatBytes(s.bytes)} • H:${s.highlights} N:${s.notes} D:${s.strokes}</div></div>`).join("");
}

async function loadConflictLog() {
  const root = document.getElementById("syncConflicts");
  if (!root) return;
  const res = await chrome.storage.local.get(CONFLICT_LOG_KEY);
  const items = Array.isArray(res[CONFLICT_LOG_KEY]) ? res[CONFLICT_LOG_KEY] : [];
  if (!items.length) {
    root.innerHTML = '<div class="list-item muted">No conflicts logged.</div>';
    return;
  }
  root.innerHTML = items.slice(-20).reverse().map((it) => `<div class="list-item"><div><strong>${escapeHtml(it.key || "unknown")}</strong></div><div class="muted">${escapeHtml(it.reason || "merge")}</div><div class="muted">${new Date(it.at || Date.now()).toLocaleString()}</div></div>`).join("");
}

document.getElementById("refreshConflicts").addEventListener("click", async () => {
  await loadConflictLog();
});

document.getElementById("clearConflicts").addEventListener("click", async () => {
  await chrome.storage.local.remove(CONFLICT_LOG_KEY);
  await loadConflictLog();
  setStatus("Conflict log cleared", "ok");
});

document.getElementById("runSelfTest").addEventListener("click", async () => {
  try {
    const stamp = Date.now();
    const key = `${SELFTEST_KEY}:${stamp}`;
    const payload = { ok: true, stamp, text: "notesme-selftest" };
    await chrome.storage.local.set({ [key]: payload });
    const got = await chrome.storage.local.get(key);
    const pass = !!(got[key] && got[key].stamp === stamp);
    await chrome.storage.local.remove(key);
    setStatus(pass ? "Self test passed" : "Self test failed", pass ? "ok" : "error");
  } catch (error) {
    console.error("NotesMe self test failed", error);
    setStatus("Self test failed", "error");
  }
});

document.getElementById("globalSearch").addEventListener("input", async (event) => {
  await runGlobalSearch(event.target.value || "");
});

loadStorageInfo();
loadSettings();
loadPageState();
loadRecentPages();
runGlobalSearch("");
loadStorageHealth();
loadConflictLog();
