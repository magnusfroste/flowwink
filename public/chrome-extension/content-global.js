// ============================================
// Generic Signal Capture — Command Palette
// Works with FlowWink, MyCMS, and other compatible CMSs
// ============================================

(() => {
  const PALETTE_ID = "signal-capture-palette";
  const FAB_ID = "signal-capture-fab";

  // Detect source type from URL
  function detectSource() {
    const host = location.hostname;
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("x.com") || host.includes("twitter.com")) return "x";
    if (host.includes("github.com")) return "github";
    if (host.includes("reddit.com")) return "reddit";
    if (host.includes("youtube.com")) return "youtube";
    return "web";
  }

  // Extract page content (selected text or main content)
  function getPageContent() {
    const sel = window.getSelection()?.toString()?.trim();
    if (sel) return sel;
    const el = document.querySelector("article") || document.querySelector("main") || document.body;
    return (el?.innerText || "").substring(0, 8000);
  }

  // Extract metadata
  function getPageMeta() {
    return {
      url: location.href,
      title: document.title,
      source_type: detectSource(),
      content: getPageContent(),
      has_selection: !!(window.getSelection()?.toString()?.trim()),
    };
  }

  // ---- Styles ----
  function injectStyles() {
    if (document.getElementById("signal-capture-styles")) return;
    const style = document.createElement("style");
    style.id = "signal-capture-styles";
    style.textContent = `
      #${FAB_ID} {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: #18181b;
        border: 1px solid #27272a;
        color: #fafafa;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        transition: transform 0.15s, box-shadow 0.15s;
        font-size: 20px;
        line-height: 1;
      }
      #${FAB_ID}:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 24px rgba(0,0,0,0.4);
      }
      #${FAB_ID}.has-selection {
        background: #3b82f6;
        border-color: #2563eb;
      }

      #${PALETTE_ID} {
        position: fixed;
        bottom: 72px;
        right: 20px;
        z-index: 2147483647;
        width: 320px;
        background: #0a0a0a;
        border: 1px solid #27272a;
        border-radius: 12px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e5e5e5;
        display: none;
        overflow: hidden;
      }
      #${PALETTE_ID}.open { display: block; }

      #${PALETTE_ID} .palette-header {
        padding: 12px 14px 8px;
        border-bottom: 1px solid #27272a;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      #${PALETTE_ID} .palette-header h3 {
        font-size: 13px;
        font-weight: 600;
        color: #fff;
        margin: 0;
      }
      #${PALETTE_ID} .palette-header .source-badge {
        font-size: 10px;
        background: #27272a;
        padding: 2px 8px;
        border-radius: 4px;
        color: #a1a1aa;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      #${PALETTE_ID} .palette-note {
        padding: 0 14px 12px;
      }
      #${PALETTE_ID} .palette-note textarea {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #27272a;
        border-radius: 6px;
        background: #18181b;
        color: #e5e5e5;
        font-size: 12px;
        resize: none;
        height: 52px;
        outline: none;
        font-family: inherit;
      }
      #${PALETTE_ID} .palette-note textarea:focus { border-color: #3b82f6; }

      #${PALETTE_ID} .palette-actions {
        padding: 8px 6px;
      }

      #${PALETTE_ID} .action-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: #e5e5e5;
        font-size: 13px;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s;
      }
      #${PALETTE_ID} .action-btn:hover {
        background: #1e1e22;
      }
      #${PALETTE_ID} .action-btn .action-icon {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
      }
      #${PALETTE_ID} .action-btn .action-label {
        font-weight: 500;
      }
      #${PALETTE_ID} .action-btn .action-desc {
        font-size: 11px;
        color: #71717a;
        margin-top: 1px;
      }
      #${PALETTE_ID} .action-btn .action-icon.signal { background: #1e3a5f; color: #60a5fa; }
      #${PALETTE_ID} .action-btn .action-icon.draft  { background: #1a3a1a; color: #4ade80; }
      #${PALETTE_ID} .action-btn .action-icon.note   { background: #3a2a1a; color: #fbbf24; }

      #${PALETTE_ID} .palette-status {
        padding: 8px 14px;
        font-size: 12px;
        text-align: center;
        border-top: 1px solid #27272a;
        min-height: 32px;
      }
      #${PALETTE_ID} .palette-status.ok  { color: #22c55e; }
      #${PALETTE_ID} .palette-status.err { color: #ef4444; }

      #${PALETTE_ID} .palette-footer {
        padding: 6px 14px 10px;
        border-top: 1px solid #27272a;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      #${PALETTE_ID} .palette-footer .meta {
        font-size: 10px;
        color: #52525b;
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${PALETTE_ID} .palette-footer .kbd {
        font-size: 10px;
        color: #52525b;
        font-family: monospace;
      }
    `;
    document.head.appendChild(style);
  }

  // ---- Build UI ----
  function createUI() {
    // FAB
    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.innerHTML = "⚡";
    fab.title = "Signal Capture (⌘⇧S)";
    fab.addEventListener("click", togglePalette);
    document.body.appendChild(fab);

    // Palette
    const palette = document.createElement("div");
    palette.id = PALETTE_ID;
    palette.innerHTML = `
      <div class="palette-header">
        <h3>⚡ Capture Signal</h3>
        <span class="source-badge">${detectSource()}</span>
      </div>
      <div class="palette-note">
        <textarea id="signal-note" placeholder="Add a note (optional)…"></textarea>
      </div>
      <div class="palette-actions">
        <button class="action-btn" data-action="signal">
          <span class="action-icon signal">📡</span>
          <div>
            <div class="action-label">Send Signal</div>
            <div class="action-desc">Capture for AI processing</div>
          </div>
        </button>
        <button class="action-btn" data-action="draft">
          <span class="action-icon draft">📝</span>
          <div>
            <div class="action-label">Save as Draft</div>
            <div class="action-desc">Create content draft</div>
          </div>
        </button>
        <button class="action-btn" data-action="bookmark">
          <span class="action-icon note">🔖</span>
          <div>
            <div class="action-label">Bookmark</div>
            <div class="action-desc">Save to memory</div>
          </div>
        </button>
      </div>
      <div class="palette-status" id="signal-status"></div>
      <div class="palette-footer">
        <span class="meta" id="signal-page-meta"></span>
        <span class="kbd">⌘⇧S</span>
      </div>
    `;
    document.body.appendChild(palette);

    // Wire action buttons
    palette.querySelectorAll(".action-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(btn.dataset.action));
    });

    // Update meta
    updateMeta();
  }

  function updateMeta() {
    const el = document.getElementById("signal-page-meta");
    if (el) el.textContent = document.title || location.hostname;

    // Update FAB highlight when text is selected
    const fab = document.getElementById(FAB_ID);
    if (fab) {
      const hasSel = !!(window.getSelection()?.toString()?.trim());
      fab.classList.toggle("has-selection", hasSel);
    }
  }

  function togglePalette() {
    const palette = document.getElementById(PALETTE_ID);
    if (!palette) return;
    const isOpen = palette.classList.toggle("open");
    if (isOpen) {
      updateMeta();
      setStatus("", "");
    }
  }

  function closePalette() {
    document.getElementById(PALETTE_ID)?.classList.remove("open");
  }

  function setStatus(msg, type) {
    const el = document.getElementById("signal-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "palette-status" + (type ? ` ${type}` : "");
  }

  // ---- Actions ----
  async function handleAction(action) {
    setStatus("Sending…", "");

    try {
      if (!chrome?.storage?.local) {
        setStatus("Extension context lost — reload the page", "err");
        return;
      }
      const stored = await chrome.storage.local.get(["endpoint", "token", "projectName"]);
      const token = stored.token;
      const endpoint = stored.endpoint;

      if (!token || !endpoint) {
        setStatus("Configure extension settings first", "err");
        return;
      }

      const meta = getPageMeta();
      const note = document.getElementById("signal-note")?.value?.trim() || "";

      // Map action to task type / enrichment
      let taskNote = note;
      if (action === "draft") {
        taskNote = `[ACTION:draft] ${note}`.trim();
      } else if (action === "bookmark") {
        taskNote = `[ACTION:bookmark] ${note}`.trim();
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signal-token": token,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: meta.url,
          title: meta.title,
          content: meta.content,
          note: taskNote,
          source_type: meta.source_type,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        const labels = { signal: "Signal sent!", draft: "Draft created!", bookmark: "Bookmarked!" };
        const projectName = stored.projectName || "CMS";
        setStatus(`✓ ${labels[action] || "Done!"} → ${projectName}`, "ok");
        const noteEl = document.getElementById("signal-note");
        if (noteEl) noteEl.value = "";
        setTimeout(closePalette, 1500);
      } else {
        setStatus(data.error || `Error ${res.status}`, "err");
      }
    } catch (err) {
      setStatus(err.message || "Network error", "err");
    }
  }

  // ---- Keyboard shortcut ----
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      togglePalette();
    }
    if (e.key === "Escape") {
      closePalette();
    }
  });

  // Update selection highlight periodically
  document.addEventListener("selectionchange", () => {
    updateMeta();
  });

  // ---- Listen for messages from admin panel (externally_connectable) ----
  chrome.runtime.onMessage?.addListener((msg, sender, sendResponse) => {
    if (msg.type === "scrape_page") {
      const meta = getPageMeta();
      sendResponse({ success: true, data: meta });
    }
  });

  // ---- Init ----
  injectStyles();
  createUI();
})();
