// Popup settings UI
const presets = {
  flowwink: {
    name: "FlowWink",
    endpoint: "https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/signal-ingest",
    token: "sig_fw_a7b3c9d2e1f4g5h6i8j0k2l3m4n5o6p7",
  },
  mycms: {
    name: "MyCMS",
    endpoint: "",
    token: "",
  },
};

// Load saved settings
async function loadSettings() {
  const stored = await chrome.storage.local.get(["endpoint", "token", "projectName"]);
  
  if (stored.projectName) {
    document.getElementById("project-name").value = stored.projectName;
  }
  if (stored.endpoint) {
    document.getElementById("endpoint").value = stored.endpoint;
  }
  if (stored.token) {
    document.getElementById("token").value = stored.token;
  }

  // Highlight active preset
  updatePresetButtons(stored.endpoint);
}

// Update preset button states
function updatePresetButtons(currentEndpoint) {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    const preset = presets[btn.dataset.preset];
    btn.classList.toggle("active", currentEndpoint === preset.endpoint);
  });
}

// Apply preset
function applyPreset(presetKey) {
  const preset = presets[presetKey];
  if (!preset) return;

  document.getElementById("project-name").value = preset.name;
  document.getElementById("endpoint").value = preset.endpoint;
  if (preset.token) {
    document.getElementById("token").value = preset.token;
  }
  
  updatePresetButtons(preset.endpoint);
  showStatus(preset.token ? "Preset applied! Ready to save." : "Preset applied! Now enter your token.", "success");
}

// Save settings
async function saveSettings() {
  const projectName = document.getElementById("project-name").value.trim();
  const endpoint = document.getElementById("endpoint").value.trim();
  const token = document.getElementById("token").value.trim();

  if (!endpoint || !token) {
    showStatus("Please fill in all required fields", "error");
    return;
  }

  // Validate endpoint URL
  try {
    new URL(endpoint);
  } catch {
    showStatus("Invalid endpoint URL", "error");
    return;
  }

  await chrome.storage.local.set({
    projectName: projectName || "CMS",
    endpoint,
    token,
  });

  showStatus("✓ Settings saved successfully!", "success");
  
  // Close popup after 1 second
  setTimeout(() => window.close(), 1000);
}

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = `status show ${type}`;
  
  setTimeout(() => {
    statusEl.classList.remove("show");
  }, 3000);
}

// Event listeners
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
});

document.getElementById("save-btn").addEventListener("click", saveSettings);

// Allow Enter key to save
document.querySelectorAll("input").forEach((input) => {
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") saveSettings();
  });
});

// Load settings on popup open
loadSettings();
