(() => {
  const INJECTION_VERSION = "0.9.7";
  if (window.__notesMeInjectedVersion === INJECTION_VERSION) {
    return;
  }
  window.__notesMeInjected = true;
  window.__notesMeInjectedVersion = INJECTION_VERSION;

  // Set to true only when debugging. Keeps the console clean in production.
  const DEBUG = false;
  const log = (...args) => { if (DEBUG) { try { console.log("[NotesMe]", ...args); } catch {} } };
  const warn = (...args) => { if (DEBUG) { try { console.warn("[NotesMe]", ...args); } catch {} } };

  const SVG_NS = "http://www.w3.org/2000/svg";
  const NOTESME_PREFIX = "notesme:v1:";
  const INDEX_KEY = `${NOTESME_PREFIX}__index`;
  const SETTINGS_KEY = `${NOTESME_PREFIX}settings`;
  const KEY_MODE_SMART = "smart";
  const KEY_MODE_PATH = "path";
  const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
  const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // cleanup once per day per browser
  const MAX_STROKE_POINTS = 400; // decimate strokes to keep storage small
  const DEFAULT_SITE_KEYING_PROFILES = {
    "trainingportal.linuxfoundation.org": KEY_MODE_PATH,
  };

  function normalizeSearch() {
    if (!location.search) {
      return "";
    }

    const params = new URLSearchParams(location.search);
    const ignored = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
    for (const key of ignored) {
      params.delete(key);
    }

    const items = [];
    for (const [key, value] of params.entries()) {
      items.push([key, value]);
    }
    items.sort((a, b) => {
      if (a[0] === b[0]) {
        return a[1].localeCompare(b[1]);
      }
      return a[0].localeCompare(b[0]);
    });

    return items.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  }

  function normalizeHash() {
    if (!location.hash) {
      return "";
    }
    // Keep hash for SPA-style routes, ignore plain in-page anchors.
    if (location.hash.startsWith("#/")) {
      return location.hash;
    }
    if (location.hash.startsWith("#!/")) {
      return location.hash;
    }
    return "";
  }

  function buildPageFingerprint(mode) {
    if (mode === KEY_MODE_PATH) {
      return `${location.origin}${location.pathname}`;
    }
    const search = normalizeSearch();
    const hash = normalizeHash();
    return `${location.origin}${location.pathname}${search ? `?${search}` : ""}${hash}`;
  }

  function buildStorageKey(pageKey) {
    // Simpler hash for reliability
    let hash = 5381;
    for (let i = 0; i < pageKey.length; i++) {
      hash = ((hash << 5) + hash) + pageKey.charCodeAt(i);
    }
    return `${NOTESME_PREFIX}p_${(hash >>> 0).toString(36)}`;
  }

  let keyMode = KEY_MODE_SMART;
  let PAGE_KEY = buildPageFingerprint(keyMode);
  let STORAGE_KEY = buildStorageKey(PAGE_KEY);
  const LEGACY_PAGE_KEY = `${location.origin}${location.pathname}`;
  const LEGACY_STORAGE_KEY = `${NOTESME_PREFIX}${LEGACY_PAGE_KEY}`;

  function setKeyMode(mode) {
    keyMode = mode === KEY_MODE_PATH ? KEY_MODE_PATH : KEY_MODE_SMART;
    PAGE_KEY = buildPageFingerprint(keyMode);
    STORAGE_KEY = buildStorageKey(PAGE_KEY);
  }

  const HIGHLIGHT_COLORS = [
    { label: "Yellow", value: "rgba(253,224,71,0.75)" },
    { label: "Green",  value: "rgba(134,239,172,0.75)" },
    { label: "Pink",   value: "rgba(249,168,212,0.75)" },
    { label: "Cyan",   value: "rgba(103,232,249,0.75)" },
  ];

  const DRAW_COLORS = [
    { label: "Red",   value: "#ef4444" },
    { label: "Blue",  value: "#3b82f6" },
    { label: "Black", value: "#111827" },
  ];

  const DRAW_WIDTHS = [
    { label: "Thin",   value: 2 },
    { label: "Medium", value: 4 },
    { label: "Thick",  value: 7 },
  ];

  const state = {
    highlights: [],           // { id, text, start, end, color, note, createdAt }
    strokes: [],              // { id, points, color, width }
    textNotes: [],            // { id, x, y, text, createdAt, updatedAt }
    drawMode: false,
    highlightMode: false,
    textNoteMode: false,
    toolbarVisible: true,
    sidebarVisible: false,
    activeHighlightColor: HIGHLIGHT_COLORS[0].value,
    drawColor: DRAW_COLORS[0].value,
    drawWidth: DRAW_WIDTHS[0].value,
    undoStack: [],            // { type: 'highlight'|'stroke', id, data? }
    redoStack: [],
    lastSelection: null,
    catMenuVisible: false,
    sidebarQuery: "",
    activeHighlightFocusId: null,
    lastViewport: null,
    unresolvedHighlights: [],
  };

  let restoreSessionEnabled = true;
  let recoveredSessionData = null;  // For "Continue Session" button

  let toolbarEl;
  let highlightModeButtonEl;
  let drawButtonEl;
  let sidebarButtonEl;
  let sidebarEl;
  let svgEl;
  let saveTimer;
  let activeStrokePoints = null;
  let activePolyline = null;
  let noteInputEl = null;
  let textNoteButtonEl;
  let catFabEl;
  let catMenuEl;
  let highlightChipEl;
  let continueSessionButtonEl = null;  // Recovery button

  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function isNotesMeElement(node) {
    return !!(node && node.nodeType === Node.ELEMENT_NODE &&
      node.closest(".notesme-toolbar, .notesme-draw-layer, .notesme-sidebar, .notesme-note-input, .notesme-text-note, .notesme-cat-fab, .notesme-cat-menu"));
  }

  function setCatMenuVisible(visible) {
    state.catMenuVisible = visible;
    if (catMenuEl) {
      catMenuEl.style.display = visible ? "flex" : "none";
    }
    if (catFabEl) {
      catFabEl.classList.toggle("notesme-active", visible);
    }
  }

  function setHighlightMode(enabled) {
    state.highlightMode = !!enabled;
    if (highlightModeButtonEl) {
      highlightModeButtonEl.classList.toggle("notesme-active", state.highlightMode);
      highlightModeButtonEl.textContent = state.highlightMode ? "Highlight: ON" : "Highlight: OFF";
      highlightModeButtonEl.title = state.highlightMode
        ? "Highlight mode is on. Select text to highlight automatically."
        : "Toggle highlight mode (Alt+H)";
    }
    if (state.highlightMode) {
      setDrawMode(false);
      setTextNoteMode(false);
    }
    if (highlightChipEl) {
      highlightChipEl.textContent = state.highlightMode ? "Highlight ON" : "Highlight OFF";
      highlightChipEl.classList.toggle("notesme-active", state.highlightMode);
    }
  }

  function buildHighlightChip() {
    const oldChip = document.querySelector(".notesme-highlight-chip");
    if (oldChip) {
      oldChip.remove();
    }

    highlightChipEl = document.createElement("button");
    highlightChipEl.type = "button";
    highlightChipEl.className = "notesme-highlight-chip";
    highlightChipEl.title = "Toggle highlight mode";
    highlightChipEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setHighlightMode(!state.highlightMode);
    });

    document.documentElement.appendChild(highlightChipEl);
    setHighlightMode(state.highlightMode);
  }

  function buildCatLauncher() {
    const oldFab = document.querySelector(".notesme-cat-fab");
    const oldMenu = document.querySelector(".notesme-cat-menu");
    if (oldFab) {
      oldFab.remove();
    }
    if (oldMenu) {
      oldMenu.remove();
    }

    catFabEl = document.createElement("button");
    catFabEl.className = "notesme-cat-fab";
    catFabEl.type = "button";
    catFabEl.title = "NotesMe — Quick Actions";
    // Batman circular logo with SVG
    catFabEl.innerHTML = `<svg viewBox="0 0 100 100" style="width:100%;height:100%;fill:currentColor;" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="batglow"><feGaussianBlur stdDeviation="2" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M 50 25 L 65 40 L 70 35 L 50 50 L 30 35 L 35 40 Z M 50 50 L 70 65 L 65 60 L 50 75 L 35 60 L 30 65 Z" fill="currentColor" filter="url(#batglow)"/>
      <circle cx="38" cy="45" r="3" fill="currentColor"/>
      <circle cx="62" cy="45" r="3" fill="currentColor"/>
    </svg>`;

    catMenuEl = document.createElement("div");
    catMenuEl.className = "notesme-cat-menu";
    catMenuEl.style.display = "none";

    // Menu title
    const menuTitle = document.createElement("div");
    menuTitle.style.cssText = "padding:4px 8px;border-bottom:1px solid var(--batman-yellow);color:var(--batman-yellow);font-weight:600;font-size:11px;text-align:center;text-transform:uppercase;opacity:0.8;margin-bottom:4px;";
    menuTitle.textContent = "⚡ NotesMe Tools";
    catMenuEl.appendChild(menuTitle);

    function addMenuButton(label, handler) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = label;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        handler();
      });
      catMenuEl.appendChild(btn);
    }

    addMenuButton("🎨 <strong>Highlight</strong> - Mark text", () => {
      highlightSelection();
      setCatMenuVisible(false);
    });
    addMenuButton("✏️ <strong>Draw</strong> - Freehand sketches", () => {
      setDrawMode(!state.drawMode);
      setCatMenuVisible(false);
    });
    addMenuButton("📝 <strong>Place Note</strong> - Sticky text", () => {
      setTextNoteMode(true);
      setCatMenuVisible(false);
    });
    addMenuButton("📋 <strong>Sidebar</strong> - View all", () => {
      setSidebarVisible(!state.sidebarVisible);
      setCatMenuVisible(false);
    });
    addMenuButton("⚙️ <strong>Toolbar</strong> - Quick access", () => {
      setToolbarVisible(!state.toolbarVisible);
      setCatMenuVisible(false);
    });
    addMenuButton("🧹 <strong>Clear Page</strong> - Remove all", () => {
      clearPage();
      setCatMenuVisible(false);
    });

    catFabEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setCatMenuVisible(!state.catMenuVisible);
    });

    document.addEventListener("click", (ev) => {
      if (!state.catMenuVisible) {
        return;
      }
      if (isNotesMeElement(ev.target)) {
        return;
      }
      setCatMenuVisible(false);
    });

    document.documentElement.appendChild(catFabEl);
    document.documentElement.appendChild(catMenuEl);
  }

  function ensureLauncherMounted() {
    if (!catFabEl || !document.documentElement.contains(catFabEl) || !catMenuEl || !document.documentElement.contains(catMenuEl)) {
      buildCatLauncher();
      setCatMenuVisible(false);
    }
  }

  function ensureUiMounted() {
    ensureLauncherMounted();
    if (!highlightChipEl || !document.documentElement.contains(highlightChipEl)) {
      buildHighlightChip();
    }
  }

  function createTextWalker() {
    return document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.length) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent) {
          return NodeFilter.FILTER_REJECT;
        }

        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (isNotesMeElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });
  }

  function getDocumentBounds() {
    const body = document.body;
    const html = document.documentElement;
    return {
      width: Math.max(
        html.scrollWidth, html.offsetWidth, html.clientWidth,
        body ? body.scrollWidth : 0, body ? body.offsetWidth : 0, window.innerWidth
      ),
      height: Math.max(
        html.scrollHeight, html.offsetHeight, html.clientHeight,
        body ? body.scrollHeight : 0, body ? body.offsetHeight : 0, window.innerHeight
      ),
    };
  }

  // -------------------------
  // Storage
  // -------------------------
  function isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function debounceSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      log("Debounced save triggered");
      saveState();
    }, 200);
  }

  function flushPendingSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    log("Flushing pending save (page hide/unload)");
    saveState();
  }

  function showContinueSessionButton() {
    if (!recoveredSessionData || continueSessionButtonEl) return;
    
    continueSessionButtonEl = document.createElement("button");
    continueSessionButtonEl.innerHTML = `<span style="font-size:18px;margin-right:4px;">↩️</span> Continue (${recoveredSessionData.highlights.length} highlights)`;
    continueSessionButtonEl.style.cssText = `
      position: fixed !important;
      bottom: 90px !important;
      right: 18px !important;
      z-index: 2147483646 !important;
      padding: 12px 14px !important;
      border: 2px solid #29b6f6 !important;
      border-radius: 8px !important;
      background: linear-gradient(135deg, #0a1929, #132f4c) !important;
      color: #29b6f6 !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      box-shadow: 0 0 20px rgba(41, 182, 246, 0.4) !important;
      animation: batpop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
      white-space: nowrap !important;
    `;

    continueSessionButtonEl.addEventListener("click", () => {
      if (recoveredSessionData) {
        state.highlights = recoveredSessionData.highlights || [];
        state.strokes = recoveredSessionData.strokes || [];
        state.textNotes = recoveredSessionData.textNotes || [];
        
        restoreHighlights();
        renderStrokes();
        renderTextNotes();
        updateSidebar();
        
        continueSessionButtonEl.remove();
        continueSessionButtonEl = null;
        recoveredSessionData = null;
        
        saveState();
        log("Session recovered and restored!");
      }
    });

    continueSessionButtonEl.addEventListener("mouseover", () => {
      continueSessionButtonEl.style.boxShadow = "0 0 30px rgba(41, 182, 246, 0.8) !important";
    });

    continueSessionButtonEl.addEventListener("mouseout", () => {
      continueSessionButtonEl.style.boxShadow = "0 0 20px rgba(41, 182, 246, 0.4) !important";
    });

    document.documentElement.appendChild(continueSessionButtonEl);
    log("Continue Session button shown");
  }

  async function getStorageIndex() {
    const res = await chrome.storage.local.get(INDEX_KEY);
    const index = res[INDEX_KEY];
    if (index && typeof index === "object" && index.pages && typeof index.pages === "object") {
      return index;
    }
    return {
      pages: {},
      lastCleanupAt: 0,
      schemaVersion: 0,
    };
  }

  async function setStorageIndex(index) {
    await chrome.storage.local.set({ [INDEX_KEY]: index });
  }

  async function touchPageIndex(lastVisit) {
    try {
      const index = await getStorageIndex();
      index.pages[STORAGE_KEY] = {
        pageKey: PAGE_KEY,
        lastVisit,
        url: location.href,
        title: document.title || location.hostname,
      };
      await setStorageIndex(index);
    } catch (error) {
      warn("failed to update storage index", error);
    }
  }

  async function migrateIndexIfMissing() {
    try {
      const index = await getStorageIndex();
      if (index.schemaVersion >= 1) {
        // Already initialized or migrated.
        return;
      }

      const all = await chrome.storage.local.get(null);
      for (const [key, val] of Object.entries(all)) {
        if (!key.startsWith(NOTESME_PREFIX)) {
          continue;
        }
        if (key === INDEX_KEY) {
          continue;
        }
        index.pages[key] = {
          pageKey: (val && val.pageKey) || "",
          lastVisit: (val && val.lastVisit) || 0,
        };
      }
      index.schemaVersion = 1;
      await setStorageIndex(index);
    } catch (error) {
      warn("index migration failed", error);
    }
  }

  async function loadSettings() {
    try {
      const res = await chrome.storage.local.get(SETTINGS_KEY);
      const settings = res[SETTINGS_KEY] || {};

      const profiles = {
        ...DEFAULT_SITE_KEYING_PROFILES,
        ...(settings.siteKeyingProfiles && typeof settings.siteKeyingProfiles === "object" ? settings.siteKeyingProfiles : {}),
      };

      const host = location.hostname.toLowerCase();
      let resolvedMode = settings.keyMode;
      for (const [domain, mode] of Object.entries(profiles)) {
        const d = String(domain || "").toLowerCase().trim();
        if (!d) {
          continue;
        }
        if (host === d || host.endsWith(`.${d}`)) {
          resolvedMode = mode;
          break;
        }
      }

      setKeyMode(resolvedMode);
      restoreSessionEnabled = settings.restoreSession !== false;
    } catch (error) {
      warn("settings load failed", error);
      setKeyMode(KEY_MODE_SMART);
      restoreSessionEnabled = true;
    }
  }

  async function loadState() {
    if (!isExtensionContextValid()) {
      warn("Skipping load - extension context invalid. Please refresh the page.");
      return;
    }
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      let persisted = result[STORAGE_KEY] || {};
      
      log("Loading state", {
        storageKey: STORAGE_KEY,
        pageKey: PAGE_KEY,
        found: !!result[STORAGE_KEY],
        highlightsCount: Array.isArray(persisted.highlights) ? persisted.highlights.length : 0,
        strokesCount: Array.isArray(persisted.strokes) ? persisted.strokes.length : 0,
      });

      if ((!persisted.highlights || !persisted.highlights.length) && (!persisted.strokes || !persisted.strokes.length)) {
        const legacyRes = await chrome.storage.local.get(LEGACY_STORAGE_KEY);
        const legacy = legacyRes[LEGACY_STORAGE_KEY] || {};
        const hasLegacyData =
          (Array.isArray(legacy.highlights) && legacy.highlights.length > 0) ||
          (Array.isArray(legacy.strokes) && legacy.strokes.length > 0);

        if (hasLegacyData) {
          log("Migrating legacy data");
          const migrated = {
            pageKey: PAGE_KEY,
            highlights: Array.isArray(legacy.highlights) ? legacy.highlights : [],
            strokes: Array.isArray(legacy.strokes) ? legacy.strokes : [],
            textNotes: [],
            ui: {},
            lastVisit: Date.now(),
          };
          await chrome.storage.local.set({ [STORAGE_KEY]: migrated });
          await chrome.storage.local.remove(LEGACY_STORAGE_KEY);
          persisted = migrated;
        }
      }

      state.highlights = Array.isArray(persisted.highlights) ? persisted.highlights : [];
      state.strokes = Array.isArray(persisted.strokes) ? persisted.strokes : [];
      state.textNotes = Array.isArray(persisted.textNotes) ? persisted.textNotes : [];

      const persistedUi = persisted.ui && typeof persisted.ui === "object" ? persisted.ui : {};
      state.toolbarVisible = persistedUi.toolbarVisible === true;
      state.sidebarVisible = persistedUi.sidebarVisible === true;
      if (Number.isFinite(persistedUi.scrollX) && Number.isFinite(persistedUi.scrollY)) {
        state.lastViewport = {
          x: Math.max(0, Number(persistedUi.scrollX)),
          y: Math.max(0, Number(persistedUi.scrollY)),
        };
      } else {
        state.lastViewport = null;
      }

      await touchPageIndex(Date.now());
    } catch (error) {
      warn("failed to load state", error);
    }
  }

  async function saveState() {
    if (!isExtensionContextValid()) {
      warn("Skipping save - extension was reloaded. Please refresh the page.");
      return;
    }
    try {
      const now = Date.now();
      state.lastViewport = {
        x: Math.max(0, Math.round(window.scrollX || 0)),
        y: Math.max(0, Math.round(window.scrollY || 0)),
      };
      const saveData = {
        pageKey: PAGE_KEY,
        highlights: state.highlights,
        strokes: state.strokes,
        textNotes: state.textNotes,
        ui: {
          toolbarVisible: !!state.toolbarVisible,
          sidebarVisible: !!state.sidebarVisible,
          scrollX: state.lastViewport.x,
          scrollY: state.lastViewport.y,
          savedAt: now,
        },
        lastVisit: now,
      };
      log("Saving state", {
        storageKey: STORAGE_KEY,
        pageKey: PAGE_KEY,
        highlights: saveData.highlights.length,
        strokes: saveData.strokes.length,
        notes: saveData.textNotes.length,
      });
      await chrome.storage.local.set({
        [STORAGE_KEY]: saveData
      });
      await touchPageIndex(now);
    } catch (error) {
      const msg = error && error.message ? String(error.message) : String(error || "");
      const isQuotaError = /quota|max_write|QUOTA/i.test(msg);

      if (isQuotaError) {
        try {
          // If storage is full, purge old pages immediately and retry once.
          await cleanupOldPages(true);
          const retryNow = Date.now();
          await chrome.storage.local.set({
            [STORAGE_KEY]: {
              pageKey: PAGE_KEY,
              highlights: state.highlights,
              strokes: state.strokes,
              textNotes: state.textNotes,
              ui: {
                toolbarVisible: !!state.toolbarVisible,
                sidebarVisible: !!state.sidebarVisible,
                scrollX: state.lastViewport ? state.lastViewport.x : Math.max(0, Math.round(window.scrollX || 0)),
                scrollY: state.lastViewport ? state.lastViewport.y : Math.max(0, Math.round(window.scrollY || 0)),
                savedAt: retryNow,
              },
              lastVisit: retryNow,
            }
          });
          await touchPageIndex(retryNow);
          return;
        } catch (retryError) {
          warn("failed to save state after cleanup retry", retryError);
          return;
        }
      }

      warn("failed to save state", error);
    }
  }

  // Remove pages not visited in MAX_AGE_MS using index metadata.
  async function cleanupOldPages(force = false) {
    try {
      const now = Date.now();
      const index = await getStorageIndex();

      if (!force && index.lastCleanupAt && (now - index.lastCleanupAt) < CLEANUP_INTERVAL_MS) {
        return;
      }

      const keysToRemove = [];
      for (const [key, meta] of Object.entries(index.pages)) {
        if (key === STORAGE_KEY) {
          continue;
        }
        const lastVisit = meta && meta.lastVisit;
        if (!lastVisit || (now - lastVisit) > MAX_AGE_MS) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        for (const key of keysToRemove) {
          delete index.pages[key];
        }
      }

      index.lastCleanupAt = now;
      await setStorageIndex(index);
    } catch (error) {
      warn("cleanup failed", error);
    }
  }

  async function refreshKeyingForCurrentPage() {
    clearHighlightsFromDom();
    closeNoteInput();
    state.highlights = [];
    state.strokes = [];
    state.textNotes = [];
    state.undoStack = [];
    state.redoStack = [];

    await loadSettings();
    await loadState();
    await cleanupOldPages();

    restoreHighlights();
    renderStrokes();
    renderTextNotes();
    updateSidebar();
  }

  // -------------------------
  // Drawing helpers
  // -------------------------
  function pointFromEvent(event) {
    return {
      x: Math.round(event.pageX),
      y: Math.round(event.pageY),
    };
  }

  function pointsToAttr(points) {
    return points.map((p) => `${p.x},${p.y}`).join(" ");
  }

  // Reduce stroke point count to limit stored bytes
  function decimatePoints(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    const result = [];
    const step = points.length / maxPoints;
    for (let i = 0; i < maxPoints; i++) {
      result.push(points[Math.round(i * step)]);
    }
    return result;
  }

  function updateDrawLayerSize() {
    if (!svgEl) return;
    const bounds = getDocumentBounds();
    svgEl.setAttribute("width", String(bounds.width));
    svgEl.setAttribute("height", String(bounds.height));
    svgEl.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
  }

  function renderStrokes() {
    if (!svgEl) return;
    svgEl.querySelectorAll("polyline[data-notesme-stroke-id]").forEach((node) => node.remove());

    for (const stroke of state.strokes) {
      const polyline = document.createElementNS(SVG_NS, "polyline");
      polyline.setAttribute("points", pointsToAttr(stroke.points));
      polyline.setAttribute("fill", "none");
      polyline.setAttribute("stroke", stroke.color || "#ef4444");
      polyline.setAttribute("stroke-width", String(stroke.width || 3));
      polyline.setAttribute("stroke-linecap", "round");
      polyline.setAttribute("stroke-linejoin", "round");
      polyline.setAttribute("data-notesme-stroke-id", stroke.id);
      svgEl.appendChild(polyline);
    }
  }

  function setDrawMode(enabled) {
    state.drawMode = enabled;
    if (drawButtonEl) {
      drawButtonEl.classList.toggle("notesme-active", enabled);
    }
    if (svgEl) {
      svgEl.style.pointerEvents = enabled ? "auto" : "none";
      svgEl.style.cursor = enabled ? "crosshair" : "default";
    }
    const drawOpts = toolbarEl && toolbarEl.querySelector(".notesme-draw-opts");
    if (drawOpts) {
      drawOpts.style.display = enabled ? "flex" : "none";
    }
    if (enabled) {
      setTextNoteMode(false);
      setHighlightMode(false);
    }
  }

  function setTextNoteMode(enabled) {
    state.textNoteMode = enabled;
    if (textNoteButtonEl) {
      textNoteButtonEl.classList.toggle("notesme-active", enabled);
    }
    if (enabled) {
      setDrawMode(false);
      setHighlightMode(false);
    }
    document.documentElement.classList.toggle("notesme-textnote-mode", enabled);
  }

  function clampNotePosition(x, y) {
    const maxX = Math.max(0, window.scrollX + window.innerWidth - 270);
    const maxY = Math.max(0, window.scrollY + window.innerHeight - 150);
    return {
      x: Math.max(0, Math.min(maxX, Math.round(x))),
      y: Math.max(0, Math.min(maxY, Math.round(y))),
    };
  }

  function updateTextNote(id, patch) {
    const idx = state.textNotes.findIndex((n) => n.id === id);
    if (idx < 0) {
      return;
    }
    state.textNotes[idx] = {
      ...state.textNotes[idx],
      ...patch,
      updatedAt: Date.now(),
    };
    debounceSave();
  }

  function removeTextNote(id) {
    const note = state.textNotes.find((n) => n.id === id);
    state.textNotes = state.textNotes.filter((n) => n.id !== id);
    const el = document.querySelector(`[data-notesme-text-note-id="${id}"]`);
    if (el) {
      el.remove();
    }
    if (note) {
      state.undoStack.push({ type: "textnote-delete", id: note.id, data: note });
      state.redoStack = [];
    }
    debounceSave();
  }

  function makeTextNoteElement(note) {
    const noteEl = document.createElement("div");
    noteEl.className = "notesme-text-note";
    noteEl.dataset.notesmeTextNoteId = note.id;
    noteEl.style.left = `${note.x}px`;
    noteEl.style.top = `${note.y}px`;

    const head = document.createElement("div");
    head.className = "notesme-text-note-head";

    const title = document.createElement("span");
    title.textContent = "Quick note";

    const actions = document.createElement("div");
    actions.className = "notesme-text-note-actions";

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "notesme-text-note-delete";

    actions.appendChild(delBtn);
    head.appendChild(title);
    head.appendChild(actions);

    const body = document.createElement("textarea");
    body.className = "notesme-text-note-body";
    body.placeholder = "Type your comment...";
    body.value = note.text || "";

    noteEl.appendChild(head);
    noteEl.appendChild(body);

    function autoSizeTextarea() {
      body.style.height = "auto";
      body.style.height = `${Math.min(260, Math.max(80, body.scrollHeight))}px`;
    }
    autoSizeTextarea();

    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function onMove(ev) {
      if (!dragging) {
        return;
      }
      const pos = clampNotePosition(ev.pageX - dragOffsetX, ev.pageY - dragOffsetY);
      noteEl.style.left = `${pos.x}px`;
      noteEl.style.top = `${pos.y}px`;
    }

    function onUp() {
      if (!dragging) {
        return;
      }
      dragging = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      const x = Number.parseInt(noteEl.style.left, 10) || 0;
      const y = Number.parseInt(noteEl.style.top, 10) || 0;
      updateTextNote(note.id, { x, y });
    }

    head.addEventListener("mousedown", (ev) => {
      if (ev.target.closest("button")) {
        return;
      }
      dragging = true;
      dragOffsetX = ev.pageX - noteEl.offsetLeft;
      dragOffsetY = ev.pageY - noteEl.offsetTop;
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
      ev.preventDefault();
      ev.stopPropagation();
    });

    delBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      removeTextNote(note.id);
    });

    body.addEventListener("input", () => {
      updateTextNote(note.id, { text: body.value });
      autoSizeTextarea();
    });

    body.addEventListener("blur", () => {
      if (!body.value.trim()) {
        removeTextNote(note.id);
      }
    });

    noteEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
    });

    document.documentElement.appendChild(noteEl);
  }

  function renderTextNotes() {
    document.querySelectorAll(".notesme-text-note[data-notesme-text-note-id]").forEach((el) => el.remove());
    for (const note of state.textNotes) {
      makeTextNoteElement(note);
    }
  }

  function createTextNoteAt(x, y, text = "") {
    const pos = clampNotePosition(x, y);
    const note = {
      id: makeId("tn"),
      x: pos.x,
      y: pos.y,
      text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.textNotes.push(note);
    state.undoStack.push({ type: "textnote-create", id: note.id });
    state.redoStack = [];
    makeTextNoteElement(note);
    debounceSave();

    const created = document.querySelector(`[data-notesme-text-note-id="${note.id}"] .notesme-text-note-body`);
    if (created) {
      created.focus();
    }
  }

  function handleTextNotePlacement(ev) {
    if (!state.textNoteMode) {
      return;
    }
    if (isNotesMeElement(ev.target)) {
      return;
    }
    createTextNoteAt(ev.pageX, ev.pageY, "");
    setTextNoteMode(false);
    ev.preventDefault();
    ev.stopPropagation();
  }

  function startStroke(event) {
    // Support stylus/pen (isPrimary) and mouse (button=0)
    if (!state.drawMode) {
      return;
    }
    
    // For pointer events, check isPrimary; for backward compat check button
    if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) {
      return;
    }

    activeStrokePoints = [pointFromEvent(event)];
    activePolyline = document.createElementNS(SVG_NS, "polyline");
    activePolyline.setAttribute("fill", "none");
    activePolyline.setAttribute("stroke", state.drawColor);
    activePolyline.setAttribute("stroke-width", String(state.drawWidth));
    activePolyline.setAttribute("stroke-linecap", "round");
    activePolyline.setAttribute("stroke-linejoin", "round");
    activePolyline.setAttribute("data-notesme-temporary", "1");
    activePolyline.setAttribute("points", pointsToAttr(activeStrokePoints));
    svgEl.appendChild(activePolyline);

    event.preventDefault();
    event.stopPropagation();
  }

  function continueStroke(event) {
    if (!state.drawMode || !activeStrokePoints || !activePolyline) {
      return;
    }

    activeStrokePoints.push(pointFromEvent(event));
    activePolyline.setAttribute("points", pointsToAttr(activeStrokePoints));

    event.preventDefault();
    event.stopPropagation();
  }

  function endStroke(event) {
    if (!state.drawMode || !activeStrokePoints || !activePolyline) {
      return;
    }

    if (activeStrokePoints.length > 1) {
      const id = makeId("s");
      const finalPoints = decimatePoints(activeStrokePoints, MAX_STROKE_POINTS);
      activePolyline.removeAttribute("data-notesme-temporary");
      activePolyline.setAttribute("data-notesme-stroke-id", id);
      activePolyline.setAttribute("points", pointsToAttr(finalPoints));

      const stroke = { id, points: finalPoints, color: state.drawColor, width: state.drawWidth };
      state.strokes.push(stroke);
      state.undoStack.push({ type: "stroke", id });
      state.redoStack = [];
      debounceSave();
    } else {
      activePolyline.remove();
    }

    activeStrokePoints = null;
    activePolyline = null;

    event.preventDefault();
    event.stopPropagation();
  }

  // -------------------------
  // Text range utilities
  // -------------------------
  function clearHighlightsFromDom() {
    const nodes = document.querySelectorAll("span[data-notesme-highlight-id]");
    for (const span of nodes) {
      const parent = span.parentNode;
      if (!parent) continue;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    }
  }

  function getGlobalOffset(node, offset) {
    try {
      const range = document.createRange();
      range.selectNodeContents(document.body);
      range.setEnd(node, offset);
      return range.toString().length;
    } catch {
      return -1;
    }
  }

  function cacheCurrentSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!range || range.collapsed || !document.body.contains(range.commonAncestorContainer)) {
      return;
    }

    const containerEl =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;

    if (isNotesMeElement(containerEl)) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return;
    }

    const start = getGlobalOffset(range.startContainer, range.startOffset);
    const end = getGlobalOffset(range.endContainer, range.endOffset);
    if (start < 0 || end <= start) {
      return;
    }

    state.lastSelection = {
      start,
      end,
      text: selectedText,
      pageKey: PAGE_KEY,
      capturedAt: Date.now(),
    };
  }

  function rangeFromOffsets(start, end) {
    if (start < 0 || end <= start) {
      return null;
    }

    const walker = createTextWalker();
    let currentNode = walker.nextNode();
    let accumulated = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;

    while (currentNode) {
      const next = accumulated + currentNode.textContent.length;

      if (!startNode && start >= accumulated && start <= next) {
        startNode = currentNode;
        startOffset = Math.max(0, Math.min(currentNode.textContent.length, start - accumulated));
      }

      if (!endNode && end >= accumulated && end <= next) {
        endNode = currentNode;
        endOffset = Math.max(0, Math.min(currentNode.textContent.length, end - accumulated));
      }

      if (startNode && endNode) break;
      accumulated = next;
      currentNode = walker.nextNode();
    }

    if (!startNode || !endNode) return null;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function findRangeByText(text, approximateStart) {
    if (!text) return null;

    const bodyText = document.body ? document.body.innerText : "";
    if (!bodyText) return null;

    let index = -1;
    if (Number.isFinite(approximateStart) && approximateStart >= 0) {
      index = bodyText.indexOf(text, Math.max(0, approximateStart - 120));
    }
    if (index < 0) index = bodyText.indexOf(text);
    if (index < 0) return null;

    return rangeFromOffsets(index, index + text.length);
  }

  function findRangeByQuoteContext(entry) {
    const exact = (entry && (entry.exact || entry.text)) ? String(entry.exact || entry.text) : "";
    if (!exact) {
      return null;
    }

    const bodyText = document.body ? document.body.innerText : "";
    if (!bodyText) {
      return null;
    }

    const prefix = entry && entry.prefix ? String(entry.prefix) : "";
    const suffix = entry && entry.suffix ? String(entry.suffix) : "";

    log("findRangeByQuoteContext", {
      exact: exact.substring(0, 40),
      prefixLen: prefix.length,
      suffixLen: suffix.length,
      bodyLength: bodyText.length,
    });

    let best = -1;
    let bestScore = -1;
    let from = 0;
    
    while (from < bodyText.length) {
      const idx = bodyText.indexOf(exact, from);
      if (idx < 0) {
        break;
      }
      
      // Get surrounding context
      const beforeStart = Math.max(0, idx - (prefix.length || 100));
      const beforeText = bodyText.slice(beforeStart, idx);
      const afterEnd = Math.min(bodyText.length, idx + exact.length + (suffix.length || 100));
      const afterText = bodyText.slice(idx + exact.length, afterEnd);
      
      let score = 10; // Base score for finding the text
      
      // Score based on prefix match (if available)
      if (prefix && prefix.length > 5) {
        const prefixEnd = beforeText.length;
        const prefixStart = Math.max(0, prefixEnd - prefix.length);
        const contextPrefix = beforeText.slice(prefixStart);
        
        if (contextPrefix === prefix) {
          score += 100; // Exact prefix match - very reliable
        } else if (contextPrefix.includes(prefix)) {
          score += 50; // Contains prefix
        } else {
          // Fuzzy match
          let matches = 0;
          for (let i = 0; i < Math.min(prefix.length, contextPrefix.length); i++) {
            if (prefix[prefix.length - 1 - i] === contextPrefix[contextPrefix.length - 1 - i]) {
              matches++;
            }
          }
          score += matches * 5;
        }
      }
      
      // Score based on suffix match (if available)
      if (suffix && suffix.length > 5) {
        const contextSuffix = afterText.slice(0, suffix.length);
        
        if (contextSuffix === suffix) {
          score += 100; // Exact suffix match
        } else if (afterText.includes(suffix)) {
          score += 50; // Contains suffix
        } else {
          // Fuzzy match
          let matches = 0;
          for (let i = 0; i < Math.min(suffix.length, contextSuffix.length); i++) {
            if (suffix[i] === contextSuffix[i]) {
              matches++;
            }
          }
          score += matches * 5;
        }
      }
      
      // Score based on original offset (if reliable)
      if (Number.isFinite(entry.start) && entry.start >= 0) {
        const offsetDiff = Math.abs(entry.start - idx);
        if (offsetDiff < 100) {
          score += Math.max(0, 20 - offsetDiff);
        }
      }
      
      log(`Candidate at offset ${idx}: score=${score} (p:${prefix.length} s:${suffix.length})`);
      
      if (score > bestScore) {
        best = idx;
        bestScore = score;
      }
      
      from = idx + Math.max(1, exact.length);
    }

    if (best < 0) {
      log("No match found for quote context");
      return null;
    }

    log(`Selected offset ${best} with score ${bestScore}`);
    return rangeFromOffsets(best, best + exact.length);
  }

  // -------------------------
  // Notes (inline annotation per highlight)
  // -------------------------
  function closeNoteInput() {
    if (noteInputEl) {
      noteInputEl.remove();
      noteInputEl = null;
    }
  }

  function openNoteInput(spanEl, highlightId) {
    closeNoteInput();
    const entry = state.highlights.find((h) => h.id === highlightId);
    if (!entry) return;

    noteInputEl = document.createElement("div");
    noteInputEl.className = "notesme-note-input";

    const textarea = document.createElement("textarea");
    textarea.value = entry.note || "";
    textarea.placeholder = "Add a note…";
    textarea.rows = 3;

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save note";
    saveBtn.className = "notesme-note-save";

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove highlight";
    removeBtn.className = "notesme-note-remove";

    noteInputEl.appendChild(textarea);
    noteInputEl.appendChild(saveBtn);
    noteInputEl.appendChild(removeBtn);

    const rect = spanEl.getBoundingClientRect();
    noteInputEl.style.top = `${rect.bottom + window.scrollY + 6}px`;
    noteInputEl.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 240)}px`;

    document.documentElement.appendChild(noteInputEl);
    textarea.focus();

    saveBtn.addEventListener("click", () => {
      entry.note = textarea.value.trim();
      updateNoteIndicators(entry);
      updateSidebar();
      debounceSave();
      closeNoteInput();
    });

    removeBtn.addEventListener("click", () => {
      removeHighlight(highlightId);
      closeNoteInput();
    });

    setTimeout(() => {
      document.addEventListener("click", function outsideClick(e) {
        if (noteInputEl && !noteInputEl.contains(e.target)) {
          closeNoteInput();
          document.removeEventListener("click", outsideClick);
        }
      });
    }, 0);
  }

  function updateNoteIndicator(spanEl, entry) {
    const existing = spanEl.querySelector(".notesme-note-dot");
    if (entry.note) {
      if (!existing) {
        const dot = document.createElement("span");
        dot.className = "notesme-note-dot";
        dot.title = entry.note;
        spanEl.appendChild(dot);
      } else {
        existing.title = entry.note;
      }
    } else if (existing) {
      existing.remove();
    }
  }

  // -------------------------
  // Highlights
  // -------------------------
  function wrapRange(range, id, color) {
    if (!range || range.collapsed) return false;

    const wrapper = document.createElement("span");
    wrapper.className = "notesme-highlight";
    wrapper.dataset.notesmeHighlightId = id;
    if (color) wrapper.style.backgroundColor = color;

    try {
      range.surroundContents(wrapper);
      return true;
    } catch {
      try {
        return wrapRangeAcrossTextNodes(range, id, color);
      } catch {
        return false;
      }
    }
  }

  function wrapRangeAcrossTextNodes(range, id, color) {
    const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;

    if (!root) {
      return false;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        const parent = node.parentElement;
        if (!parent || isNotesMeElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        try {
          return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        } catch {
          return NodeFilter.FILTER_REJECT;
        }
      }
    });

    const segments = [];
    let node = walker.nextNode();
    while (node) {
      let startOffset = 0;
      let endOffset = node.textContent.length;

      if (node === range.startContainer) {
        startOffset = range.startOffset;
      }
      if (node === range.endContainer) {
        endOffset = range.endOffset;
      }

      if (startOffset < endOffset) {
        segments.push({ node, startOffset, endOffset });
      }

      node = walker.nextNode();
    }

    let wrapped = 0;
    for (const seg of segments) {
      const subRange = document.createRange();
      try {
        subRange.setStart(seg.node, seg.startOffset);
        subRange.setEnd(seg.node, seg.endOffset);

        const span = document.createElement("span");
        span.className = "notesme-highlight";
        span.dataset.notesmeHighlightId = id;
        if (color) {
          span.style.backgroundColor = color;
        }
        subRange.surroundContents(span);
        wrapped += 1;
      } catch {
        // Ignore this segment and continue with others.
      }
    }

    return wrapped > 0;
  }

  function getHighlightSpans(id) {
    return Array.from(document.querySelectorAll(`[data-notesme-highlight-id="${id}"]`));
  }

  function updateNoteIndicators(entry) {
    const spans = getHighlightSpans(entry.id);
    for (const span of spans) {
      const existing = span.querySelector(".notesme-note-dot");
      if (existing) {
        existing.remove();
      }
    }

    if (!entry.note || !spans.length) {
      return;
    }

    const dot = document.createElement("span");
    dot.className = "notesme-note-dot";
    dot.title = entry.note;
    spans[0].appendChild(dot);
  }

  function attachHighlightListeners(entry) {
    const spans = getHighlightSpans(entry.id);
    for (const spanEl of spans) {
      if (spanEl.dataset.notesmeBound === "1") {
        continue;
      }
      spanEl.dataset.notesmeBound = "1";
      spanEl.addEventListener("click", (e) => {
        if (state.drawMode) return;
        e.stopPropagation();
        openNoteInput(spanEl, entry.id);
      });
    }
    updateNoteIndicators(entry);
  }

  function applyHighlight(entry) {
    let range = rangeFromOffsets(entry.start, entry.end);
    if (!range) range = findRangeByText(entry.text, entry.start);
    if (!range) range = findRangeByQuoteContext(entry);
    if (!range) {
      log(`FAILED to restore highlight ${entry.id}`);
      return false;
    }

    const ok = wrapRange(range, entry.id, entry.color || HIGHLIGHT_COLORS[0].value);
    if (ok) {
      attachHighlightListeners(entry);
    }
    return ok;
  }

  function removeHighlight(id) {
    const spans = getHighlightSpans(id);
    for (const spanEl of spans) {
      const parent = spanEl.parentNode;
      if (!parent) {
        continue;
      }
      while (spanEl.firstChild) parent.insertBefore(spanEl.firstChild, spanEl);
      parent.removeChild(spanEl);
    }
    state.highlights = state.highlights.filter((h) => h.id !== id);
    updateSidebar();
    debounceSave();
  }

  function highlightSelection() {
    const selection = window.getSelection();
    let range = null;
    let selectedText = "";
    let start = -1;
    let end = -1;

    if (selection && selection.rangeCount > 0) {
      const currentRange = selection.getRangeAt(0);
      if (currentRange && !currentRange.collapsed && document.body.contains(currentRange.commonAncestorContainer)) {
        const textNow = selection.toString().trim();
        const startNow = getGlobalOffset(currentRange.startContainer, currentRange.startOffset);
        const endNow = getGlobalOffset(currentRange.endContainer, currentRange.endOffset);
        if (textNow && startNow >= 0 && endNow > startNow) {
          range = currentRange;
          selectedText = textNow;
          start = startNow;
          end = endNow;
          state.lastSelection = {
            start,
            end,
            text: selectedText,
            pageKey: PAGE_KEY,
            capturedAt: Date.now(),
          };
        }
      }
    }

    if ((!range || !selectedText) && state.lastSelection && state.lastSelection.pageKey === PAGE_KEY) {
      const fallbackRange = rangeFromOffsets(state.lastSelection.start, state.lastSelection.end);
      if (fallbackRange) {
        range = fallbackRange;
        selectedText = state.lastSelection.text;
        start = state.lastSelection.start;
        end = state.lastSelection.end;
      }
    }

    if (!range || !selectedText || start < 0 || end <= start) {
      return false;
    }

    const entry = {
      id: makeId("h"),
      text: selectedText,
      exact: selectedText,
      prefix: "",
      suffix: "",
      start,
      end,
      color: state.activeHighlightColor,
      note: "",
      createdAt: Date.now(),
    };

    const bodyText = document.body ? document.body.innerText : "";
    if (bodyText && start >= 0 && end > start) {
      entry.prefix = bodyText.slice(Math.max(0, start - 100), start); // Increased from 30 to 100
      entry.suffix = bodyText.slice(end, Math.min(bodyText.length, end + 100)); // Increased from 30 to 100
    }

    const applied = wrapRange(range, entry.id, entry.color);
    if (!applied) return false;

    attachHighlightListeners(entry);

    state.highlights.push(entry);
    state.undoStack.push({ type: "highlight", id: entry.id });
    state.redoStack = [];

    updateSidebar();
    debounceSave();
    if (selection && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }
    return true;
  }

  function handleAutoHighlightMouseUp(event) {
    if (!state.highlightMode || state.drawMode || state.textNoteMode) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (isNotesMeElement(event.target)) {
      return;
    }

    // Wait for the browser to finalize selection before reading it.
    setTimeout(() => {
      if (!state.highlightMode) {
        return;
      }
      highlightSelection();
    }, 0);
  }

  function focusHighlightByIndex(indexDelta) {
    if (!state.highlights.length) {
      return;
    }

    const sorted = [...state.highlights].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    let currentIndex = sorted.findIndex((h) => h.id === state.activeHighlightFocusId);
    if (currentIndex < 0) {
      currentIndex = indexDelta > 0 ? -1 : 0;
    }
    const nextIndex = (currentIndex + indexDelta + sorted.length) % sorted.length;
    const target = sorted[nextIndex];
    state.activeHighlightFocusId = target.id;

    const spanEl = document.querySelector(`[data-notesme-highlight-id="${target.id}"]`);
    if (!spanEl) {
      return;
    }
    spanEl.scrollIntoView({ behavior: "smooth", block: "center" });
    spanEl.style.outline = "2px solid #0f766e";
    setTimeout(() => {
      spanEl.style.outline = "";
    }, 1200);
  }

  // -------------------------
  // Undo / Redo
  // -------------------------
  function undo() {
    if (!state.undoStack.length) return;
    const action = state.undoStack.pop();

    if (action.type === "highlight") {
      const entry = state.highlights.find((h) => h.id === action.id);
      if (entry) {
        state.highlights = state.highlights.filter((h) => h.id !== action.id);
        const spans = getHighlightSpans(action.id);
        for (const spanEl of spans) {
          const parent = spanEl.parentNode;
          if (!parent) {
            continue;
          }
          while (spanEl.firstChild) parent.insertBefore(spanEl.firstChild, spanEl);
          parent.removeChild(spanEl);
        }
        state.redoStack.push({ type: "highlight", id: action.id, data: entry });
        updateSidebar();
        debounceSave();
      }
    } else if (action.type === "stroke") {
      const idx = state.strokes.findIndex((s) => s.id === action.id);
      if (idx !== -1) {
        const stroke = state.strokes.splice(idx, 1)[0];
        state.redoStack.push({ type: "stroke", id: action.id, data: stroke });
        renderStrokes();
        debounceSave();
      }
    } else if (action.type === "textnote-create") {
      const idx = state.textNotes.findIndex((n) => n.id === action.id);
      if (idx !== -1) {
        const note = state.textNotes.splice(idx, 1)[0];
        const el = document.querySelector(`[data-notesme-text-note-id="${note.id}"]`);
        if (el) el.remove();
        state.redoStack.push({ type: "textnote-create", id: action.id, data: note });
        debounceSave();
      }
    } else if (action.type === "textnote-delete" && action.data) {
      state.textNotes.push(action.data);
      makeTextNoteElement(action.data);
      state.redoStack.push({ type: "textnote-delete", id: action.id, data: action.data });
      debounceSave();
    }
  }

  function undoByType(type) {
    const idx = state.undoStack.map((a) => a.type).lastIndexOf(type);
    if (idx < 0) {
      return;
    }
    const action = state.undoStack.splice(idx, 1)[0];
    state.undoStack.push(action);
    undo();
  }

  function redo() {
    if (!state.redoStack.length) return;
    const action = state.redoStack.pop();

    if (action.type === "highlight" && action.data) {
      state.highlights.push(action.data);
      applyHighlight(action.data);
      state.undoStack.push({ type: "highlight", id: action.id });
      updateSidebar();
      debounceSave();
    } else if (action.type === "stroke" && action.data) {
      state.strokes.push(action.data);
      renderStrokes();
      state.undoStack.push({ type: "stroke", id: action.id });
      debounceSave();
    } else if (action.type === "textnote-create" && action.data) {
      state.textNotes.push(action.data);
      makeTextNoteElement(action.data);
      state.undoStack.push({ type: "textnote-create", id: action.id });
      debounceSave();
    } else if (action.type === "textnote-delete" && action.data) {
      const idx = state.textNotes.findIndex((n) => n.id === action.id);
      if (idx !== -1) {
        state.textNotes.splice(idx, 1);
      }
      const el = document.querySelector(`[data-notesme-text-note-id="${action.id}"]`);
      if (el) el.remove();
      state.undoStack.push({ type: "textnote-delete", id: action.id, data: action.data });
      debounceSave();
    }
  }

  function openCommandPalette() {
    const help = [
      "h: Toggle highlight mode",
      "d: Toggle draw mode",
      "n: Toggle place note mode",
      "s: Toggle sidebar",
      "t: Toggle toolbar",
      "u: Undo (all)",
      "uh: Undo highlight",
      "ud: Undo drawing",
      "un: Undo note",
      "r: Redo",
      "v: Review unresolved highlights",
      "c: Clear page",
    ].join("\n");

    const cmd = window.prompt(`NotesMe Command Palette\n${help}\n\nEnter command:`);
    if (!cmd) {
      return;
    }
    const key = cmd.trim().toLowerCase();
    switch (key) {
      case "h": setHighlightMode(!state.highlightMode); break;
      case "d": setDrawMode(!state.drawMode); break;
      case "n": setTextNoteMode(!state.textNoteMode); break;
      case "s": setSidebarVisible(!state.sidebarVisible); break;
      case "t": setToolbarVisible(!state.toolbarVisible); break;
      case "u": undo(); break;
      case "uh": undoByType("highlight"); break;
      case "ud": undoByType("stroke"); break;
      case "un": undoByType("textnote-create"); break;
      case "r": redo(); break;
      case "v": reviewUnresolvedHighlights(); break;
      case "c": clearPage(); break;
      default: break;
    }
  }

  // -------------------------
  // Clear page
  // -------------------------
  function clearPage() {
    state.highlights = [];
    state.strokes = [];
    state.textNotes = [];
    state.undoStack = [];
    state.redoStack = [];
    clearHighlightsFromDom();
    renderStrokes();
    renderTextNotes();
    updateSidebar();
    debounceSave();
  }

  // -------------------------
  // Sidebar
  // -------------------------
  function buildSidebar() {
    sidebarEl = document.createElement("div");
    sidebarEl.className = "notesme-sidebar";
    sidebarEl.style.display = "none";
    document.documentElement.appendChild(sidebarEl);
  }

  function updateSidebar() {
    if (!sidebarEl) return;
    sidebarEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "notesme-sidebar-header";
    header.textContent = `NotesMe — ${state.highlights.length} highlight${state.highlights.length !== 1 ? "s" : ""}`;
    sidebarEl.appendChild(header);

    if (state.unresolvedHighlights.length > 0) {
      const warn = document.createElement("div");
      warn.className = "notesme-sidebar-empty";
      warn.textContent = `${state.unresolvedHighlights.length} highlight(s) need review.`;

      const reviewBtn = document.createElement("button");
      reviewBtn.textContent = "Review next";
      reviewBtn.style.margin = "0 14px 8px";
      reviewBtn.style.border = "0";
      reviewBtn.style.borderRadius = "7px";
      reviewBtn.style.padding = "6px 8px";
      reviewBtn.style.background = "#0f766e";
      reviewBtn.style.color = "#fff";
      reviewBtn.style.cursor = "pointer";
      reviewBtn.addEventListener("click", () => {
        reviewUnresolvedHighlights();
      });

      sidebarEl.appendChild(warn);
      sidebarEl.appendChild(reviewBtn);
    }

    const filterWrap = document.createElement("div");
    filterWrap.className = "notesme-sidebar-filter";

    const filterInput = document.createElement("input");
    filterInput.type = "search";
    filterInput.placeholder = "Search highlights/notes...";
    filterInput.value = state.sidebarQuery;
    filterInput.className = "notesme-sidebar-search";
    filterInput.addEventListener("input", () => {
      state.sidebarQuery = filterInput.value || "";
      updateSidebar();
    });
    filterWrap.appendChild(filterInput);
    sidebarEl.appendChild(filterWrap);

    const query = state.sidebarQuery.trim().toLowerCase();
    const entries = query
      ? state.highlights.filter((entry) =>
          (entry.text && entry.text.toLowerCase().includes(query)) ||
          (entry.note && entry.note.toLowerCase().includes(query))
        )
      : state.highlights;

    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "notesme-sidebar-empty";
      empty.textContent = query ? "No matches for your search." : "No highlights on this page yet.";
      sidebarEl.appendChild(empty);
      return;
    }

    for (const entry of entries) {
      const item = document.createElement("div");
      item.className = "notesme-sidebar-item";

      const colorBar = document.createElement("div");
      colorBar.className = "notesme-sidebar-color-bar";
      colorBar.style.background = entry.color;

      const content = document.createElement("div");
      content.className = "notesme-sidebar-content";

      const text = document.createElement("p");
      text.className = "notesme-sidebar-text";
      text.textContent = entry.text.length > 120 ? entry.text.slice(0, 120) + "…" : entry.text;
      content.appendChild(text);

      if (entry.note) {
        const note = document.createElement("p");
        note.className = "notesme-sidebar-note";
        note.textContent = entry.note;
        content.appendChild(note);
      }

      item.appendChild(colorBar);
      item.appendChild(content);

      item.addEventListener("click", () => {
        const spanEl = document.querySelector(`[data-notesme-highlight-id="${entry.id}"]`);
        if (spanEl) {
          spanEl.scrollIntoView({ behavior: "smooth", block: "center" });
          spanEl.style.outline = "2px solid #6366f1";
          setTimeout(() => { spanEl.style.outline = ""; }, 1500);
        }
      });

      sidebarEl.appendChild(item);
    }
  }

  function setSidebarVisible(visible) {
    state.sidebarVisible = visible;
    if (sidebarEl) sidebarEl.style.display = visible ? "flex" : "none";
    if (sidebarButtonEl) sidebarButtonEl.classList.toggle("notesme-active", visible);
  }

  // -------------------------
  // Toolbar
  // -------------------------
  function makeSep() {
    const sep = document.createElement("div");
    sep.className = "notesme-sep";
    return sep;
  }

  function buildToolbar() {
    toolbarEl = document.createElement("div");
    toolbarEl.className = "notesme-toolbar";

    // Highlight color swatches
    const colorsWrap = document.createElement("div");
    colorsWrap.className = "notesme-color-swatches";
    for (const c of HIGHLIGHT_COLORS) {
      const btn = document.createElement("button");
      btn.className = "notesme-swatch";
      btn.style.background = c.value;
      btn.title = `Highlight: ${c.label}`;
      if (c.value === state.activeHighlightColor) btn.classList.add("notesme-active");
      btn.addEventListener("click", () => {
        state.activeHighlightColor = c.value;
        colorsWrap.querySelectorAll(".notesme-swatch").forEach((b) => b.classList.remove("notesme-active"));
        btn.classList.add("notesme-active");
      });
      colorsWrap.appendChild(btn);
    }

    highlightModeButtonEl = document.createElement("button");
    highlightModeButtonEl.textContent = "Highlight: OFF";
    highlightModeButtonEl.title = "Toggle highlight mode (Alt+H)";
    highlightModeButtonEl.addEventListener("click", () => setHighlightMode(!state.highlightMode));

    const sep1 = makeSep();

    drawButtonEl = document.createElement("button");
    drawButtonEl.textContent = "Draw";
    drawButtonEl.title = "Toggle draw mode (Alt+D)";
    drawButtonEl.addEventListener("click", () => setDrawMode(!state.drawMode));

    textNoteButtonEl = document.createElement("button");
    textNoteButtonEl.textContent = "Place Note";
    textNoteButtonEl.title = "Place note on page (Alt+N)";
    textNoteButtonEl.addEventListener("click", () => setTextNoteMode(!state.textNoteMode));

    // Draw sub-options (hidden until draw mode is active)
    const drawOpts = document.createElement("div");
    drawOpts.className = "notesme-draw-opts";
    drawOpts.style.display = "none";

    for (const c of DRAW_COLORS) {
      const btn = document.createElement("button");
      btn.className = "notesme-swatch";
      btn.style.background = c.value;
      btn.title = `Draw: ${c.label}`;
      if (c.value === state.drawColor) btn.classList.add("notesme-active");
      btn.addEventListener("click", () => {
        state.drawColor = c.value;
        drawOpts.querySelectorAll(".notesme-swatch").forEach((b) => b.classList.remove("notesme-active"));
        btn.classList.add("notesme-active");
      });
      drawOpts.appendChild(btn);
    }

    const widthSelect = document.createElement("select");
    widthSelect.className = "notesme-width-select";
    for (const w of DRAW_WIDTHS) {
      const opt = document.createElement("option");
      opt.value = String(w.value);
      opt.textContent = w.label;
      if (w.value === state.drawWidth) opt.selected = true;
      widthSelect.appendChild(opt);
    }
    widthSelect.addEventListener("change", () => {
      state.drawWidth = Number(widthSelect.value);
    });
    drawOpts.appendChild(widthSelect);

    const sep2 = makeSep();

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "Prev";
    prevBtn.title = "Jump to previous highlight (Alt+J)";
    prevBtn.addEventListener("click", () => focusHighlightByIndex(-1));

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.title = "Jump to next highlight (Alt+K)";
    nextBtn.addEventListener("click", () => focusHighlightByIndex(1));

    const sepNav = makeSep();

    const undoBtn = document.createElement("button");
    undoBtn.textContent = "Undo";
    undoBtn.title = "Undo last action (Alt+Z)";
    undoBtn.addEventListener("click", undo);

    const redoBtn = document.createElement("button");
    redoBtn.textContent = "Redo";
    redoBtn.title = "Redo (Alt+Y)";
    redoBtn.addEventListener("click", redo);

    const sep3 = makeSep();

    sidebarButtonEl = document.createElement("button");
    sidebarButtonEl.textContent = "Notes";
    sidebarButtonEl.title = "Toggle sidebar (Alt+S)";
    sidebarButtonEl.addEventListener("click", () => setSidebarVisible(!state.sidebarVisible));

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", clearPage);

    const hideBtn = document.createElement("button");
    hideBtn.textContent = "Hide";
    hideBtn.title = "Hide toolbar (Alt+T to restore)";
    hideBtn.addEventListener("click", () => setToolbarVisible(false));

    toolbarEl.appendChild(colorsWrap);
    toolbarEl.appendChild(highlightModeButtonEl);
    toolbarEl.appendChild(sep1);
    toolbarEl.appendChild(drawButtonEl);
    toolbarEl.appendChild(textNoteButtonEl);
    toolbarEl.appendChild(drawOpts);
    toolbarEl.appendChild(sep2);
    toolbarEl.appendChild(prevBtn);
    toolbarEl.appendChild(nextBtn);
    toolbarEl.appendChild(sepNav);
    toolbarEl.appendChild(undoBtn);
    toolbarEl.appendChild(redoBtn);
    toolbarEl.appendChild(sep3);
    toolbarEl.appendChild(sidebarButtonEl);
    toolbarEl.appendChild(clearBtn);
    toolbarEl.appendChild(hideBtn);

    document.documentElement.appendChild(toolbarEl);
  }

  function setToolbarVisible(visible) {
    state.toolbarVisible = visible;
    if (toolbarEl) toolbarEl.style.display = visible ? "flex" : "none";
  }

  // -------------------------
  // Draw layer
  // -------------------------
  function buildDrawLayer() {
    svgEl = document.createElementNS(SVG_NS, "svg");
    svgEl.classList.add("notesme-draw-layer");
    svgEl.style.pointerEvents = "none";

    svgEl.addEventListener("pointerdown", startStroke, true);
    svgEl.addEventListener("pointermove", continueStroke, true);
    svgEl.addEventListener("pointerup", endStroke, true);
    svgEl.addEventListener("pointercancel", endStroke, true);

    updateDrawLayerSize();
    document.documentElement.appendChild(svgEl);

    window.addEventListener("resize", updateDrawLayerSize);
    window.addEventListener("load", updateDrawLayerSize);
  }

  function restoreHighlights() {
    state.unresolvedHighlights = [];
    for (const entry of state.highlights) {
      // Skip ones already present in the DOM (avoids duplicate wrapping on retries).
      if (getHighlightSpans(entry.id).length > 0) {
        continue;
      }
      const ok = applyHighlight(entry);
      if (!ok) {
        state.unresolvedHighlights.push(entry.id);
      }
    }
  }

  // Re-attempt only the highlights that could not be anchored yet. Useful for
  // pages that load text asynchronously (SPAs, lazy content, infinite scroll).
  function retryUnresolvedHighlights() {
    if (!state.unresolvedHighlights.length) {
      return;
    }
    const stillUnresolved = [];
    for (const id of state.unresolvedHighlights) {
      const entry = state.highlights.find((h) => h.id === id);
      if (!entry) {
        continue;
      }
      if (getHighlightSpans(id).length > 0) {
        continue; // already restored elsewhere
      }
      if (!applyHighlight(entry)) {
        stillUnresolved.push(id);
      }
    }
    state.unresolvedHighlights = stillUnresolved;
    updateSidebar();
  }

  // Schedule a few retries (with backoff) plus a short-lived DOM observer so
  // highlights reliably re-anchor after dynamic content finishes loading.
  function scheduleHighlightRestoreRetries() {
    const delays = [400, 1000, 2500, 5000];
    for (const delay of delays) {
      setTimeout(() => {
        if (state.unresolvedHighlights.length) {
          retryUnresolvedHighlights();
        }
      }, delay);
    }

    if (typeof MutationObserver === "undefined" || !document.body) {
      return;
    }
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (!state.unresolvedHighlights.length) {
        observer.disconnect();
        return;
      }
      if (scheduled) {
        return;
      }
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        retryUnresolvedHighlights();
        if (!state.unresolvedHighlights.length) {
          observer.disconnect();
        }
      }, 300);
    });
    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch {
      // Some documents disallow observing; retries above still cover most cases.
    }
    // Stop observing after a while to avoid long-lived overhead.
    setTimeout(() => observer.disconnect(), 20000);
  }

  function reviewUnresolvedHighlights() {
    if (!state.unresolvedHighlights.length) {
      return false;
    }

    const unresolvedId = state.unresolvedHighlights[0];
    const entry = state.highlights.find((h) => h.id === unresolvedId);
    if (!entry) {
      return false;
    }

    const range = findRangeByText(entry.text, entry.start) || findRangeByQuoteContext(entry);
    if (!range) {
      return false;
    }

    const applied = wrapRange(range, entry.id, entry.color || HIGHLIGHT_COLORS[0].value);
    if (applied) {
      attachHighlightListeners(entry);
      state.unresolvedHighlights = state.unresolvedHighlights.filter((id) => id !== entry.id);
      updateSidebar();
      debounceSave();
      return true;
    }

    return false;
  }

  // -------------------------
  // Keyboard shortcuts (Alt+key to avoid site conflicts)
  // -------------------------
  function handleKeydown(e) {
    if (!e.altKey) return;
    switch (e.key.toLowerCase()) {
      case "h": setHighlightMode(!state.highlightMode); break;
      case "d": setDrawMode(!state.drawMode); break;
      case "n": setTextNoteMode(!state.textNoteMode); break;
      case "j": focusHighlightByIndex(-1); break;
      case "k": focusHighlightByIndex(1); break;
      case "s": setSidebarVisible(!state.sidebarVisible); break;
      case "t": setToolbarVisible(!state.toolbarVisible); break;
      case "z": undo(); break;
      case "y": redo(); break;
      case "1": undoByType("highlight"); break;
      case "2": undoByType("stroke"); break;
      case "3": undoByType("textnote-create"); break;
      case "p": openCommandPalette(); break;
      case "v": reviewUnresolvedHighlights(); break;
    }
  }

  // -------------------------
  // Message listener (from popup)
  // -------------------------
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      try {
        return handleRuntimeMessage(message, sendResponse);
      } catch (error) {
        warn("message handler failed", error);
        try { sendResponse({ ok: false, reason: "Handler error" }); } catch {}
        return false;
      }
    });
  }

  function handleRuntimeMessage(message, sendResponse) {
    if (!message || typeof message.type !== "string") {
      sendResponse({ ok: false, reason: "Invalid message" });
      return false;
    }

    if (message.type === "NOTESME_PING") {
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "NOTESME_REFRESH_KEYING") {
      refreshKeyingForCurrentPage()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false, reason: "Could not refresh keying" }));
      return true;
    }

    switch (message.type) {
      case "NOTESME_TOGGLE_TOOLBAR":
        setToolbarVisible(!state.toolbarVisible);
        sendResponse({ ok: true });
        return false;
      case "NOTESME_HIGHLIGHT": {
        const next = !state.highlightMode;
        setHighlightMode(next);
        sendResponse({
          ok: true,
          highlightMode: state.highlightMode,
          message: state.highlightMode
            ? "Highlight mode ON: select text on the page to highlight"
            : "Highlight mode OFF"
        });
        return false;
      }
      case "NOTESME_GET_STATE":
        sendResponse({
          ok: true,
          highlightMode: !!state.highlightMode,
          pageKey: PAGE_KEY,
          pageUrl: location.href,
          pageTitle: document.title || location.hostname,
          counts: {
            highlights: state.highlights.length,
            notes: state.textNotes.length,
            strokes: state.strokes.length,
            unresolvedHighlights: state.unresolvedHighlights.length,
          },
        });
        return false;
      case "NOTESME_REVIEW_UNRESOLVED":
        sendResponse({ ok: reviewUnresolvedHighlights() });
        return false;
      case "NOTESME_TOGGLE_DRAW":
        setDrawMode(!state.drawMode);
        sendResponse({ ok: true });
        return false;
      case "NOTESME_ADD_TEXT_NOTE":
        sendResponse({ ok: false, reason: "Use Place Note" });
        return false;
      case "NOTESME_TOGGLE_TEXT_NOTE_MODE":
        setTextNoteMode(!state.textNoteMode);
        sendResponse({ ok: true });
        return false;
      case "NOTESME_TOGGLE_SIDEBAR":
        setSidebarVisible(!state.sidebarVisible);
        sendResponse({ ok: true });
        return false;
      case "NOTESME_CLEAR":
        clearPage();
        sendResponse({ ok: true });
        return false;
      default:
        sendResponse({ ok: false, reason: "Unknown action" });
        return false;
    }
  }

  // -------------------------
  // Init
  // -------------------------
  async function init() {
    await loadSettings();
    await migrateIndexIfMissing();
    await loadState();
    cleanupOldPages(); // async, non-blocking

    buildToolbar();
    buildHighlightChip();
    buildCatLauncher();
    buildSidebar();
    buildDrawLayer();

    restoreHighlights();
    scheduleHighlightRestoreRetries();
    renderStrokes();
    renderTextNotes();
    updateSidebar();
    setDrawMode(false);
    setHighlightMode(false);
    setTextNoteMode(false);
    setToolbarVisible(restoreSessionEnabled ? state.toolbarVisible : false);
    setSidebarVisible(restoreSessionEnabled ? state.sidebarVisible : false);
    setCatMenuVisible(false);

    if (restoreSessionEnabled && state.lastViewport && Number.isFinite(state.lastViewport.y)) {
      setTimeout(() => {
        window.scrollTo(state.lastViewport.x || 0, state.lastViewport.y || 0);
      }, 80);
    }

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("selectionchange", cacheCurrentSelection);
    document.addEventListener("mouseup", handleAutoHighlightMouseUp, true);
    document.addEventListener("mousedown", handleTextNotePlacement, true);
    document.addEventListener("visibilitychange", ensureUiMounted);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushPendingSave();
      }
    });
    window.addEventListener("focus", ensureUiMounted);
    window.addEventListener("pagehide", flushPendingSave);
    window.addEventListener("beforeunload", flushPendingSave);
    setInterval(ensureUiMounted, 12000);
    setTimeout(ensureUiMounted, 1200);
  }

  init().catch((error) => warn("init failed", error));
})();
