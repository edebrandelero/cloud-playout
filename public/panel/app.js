const STORAGE_KEY = "cloud-playout-api-key";
const CHANNEL_KEY = "cloud-playout-channel-id";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let pollTimer = null;
let hlsInstance = null;

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

function getSelectedChannelId() {
  return $("#channel-select").value || localStorage.getItem(CHANNEL_KEY) || "";
}

function setSelectedChannelId(id) {
  $("#channel-select").value = id;
  if (id) localStorage.setItem(CHANNEL_KEY, id);
}

function showToast(message, type = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add("hidden"), 4000);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("pt-BR");
}

function statusBadge(status) {
  const map = {
    idle: "badge-idle",
    playing: "badge-playing",
    paused: "badge-paused",
    stopped: "badge-idle",
  };
  return `<span class="badge ${map[status] ?? "badge-idle"}">${status}</span>`;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const key = getApiKey();

  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error ?? `Erro ${res.status}`);
  }

  return data;
}

async function checkConnection() {
  const badge = $("#conn-status");
  try {
    const health = await fetch("/health").then((r) => r.json());
    if (health.auth && !getApiKey()) {
      badge.textContent = "API key necessária";
      badge.className = "badge badge-error";
      return;
    }
    if (getApiKey()) {
      await api("/channels");
      badge.textContent = "Conectado";
      badge.className = "badge badge-ok";
    } else {
      badge.textContent = "Sem autenticação";
      badge.className = "badge badge-idle";
    }
  } catch {
    badge.textContent = "Erro de conexão";
    badge.className = "badge badge-error";
  }
}

async function loadChannels() {
  const channels = await api("/channels");
  const tbody = $("#channels-table");
  const select = $("#channel-select");

  const current = getSelectedChannelId();
  select.innerHTML = '<option value="">— selecione —</option>';

  tbody.innerHTML = channels.length
    ? channels
        .map(
          (ch) => `
      <tr>
        <td><strong>${esc(ch.name)}</strong><br><span class="muted">${esc(ch.id)}</span></td>
        <td>${ch.outputUrl ? esc(ch.outputUrl) : "<span class='muted'>HLS local</span>"}</td>
        <td>${formatDate(ch.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-secondary" data-select="${ch.id}">Usar</button>
          <button class="btn btn-sm btn-danger" data-delete="${ch.id}">Excluir</button>
        </td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="empty">Nenhum canal</td></tr>';

  for (const ch of channels) {
    const opt = document.createElement("option");
    opt.value = ch.id;
    opt.textContent = ch.name;
    select.appendChild(opt);
  }

  if (current && channels.some((c) => c.id === current)) {
    setSelectedChannelId(current);
  }

  tbody.querySelectorAll("[data-select]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setSelectedChannelId(btn.dataset.select);
      showToast("Canal selecionado");
    });
  });

  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir canal?")) return;
      await api(`/channels/${btn.dataset.delete}`, { method: "DELETE" });
      showToast("Canal excluído");
      await loadChannels();
      await loadPlaylists();
    });
  });
}

async function loadStorage() {
  const files = await api("/storage");
  const tbody = $("#storage-table");

  tbody.innerHTML = files.length
    ? files
        .map(
          (f) => `
      <tr>
        <td>${esc(f.filename)}</td>
        <td>${f.type}</td>
        <td>${formatBytes(f.size)}</td>
        <td>
          <button class="btn btn-sm btn-primary" data-asset="${esc(f.path)}" data-name="${esc(f.filename)}">Registrar asset</button>
          <button class="btn btn-sm btn-danger" data-del-file="${esc(f.filename)}">Excluir</button>
        </td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="empty">Nenhum arquivo</td></tr>';

  tbody.querySelectorAll("[data-asset]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.name.replace(/\.\w+$/, "");
      await api("/assets", {
        method: "POST",
        body: { name, path: btn.dataset.asset, type: btn.dataset.asset.match(/\.(mp3|wav|m4a|aac)$/i) ? "audio" : "video" },
      });
      showToast("Asset registrado");
      await loadAssets();
    });
  });

  tbody.querySelectorAll("[data-del-file]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir arquivo?")) return;
      await api(`/storage/${btn.dataset.delFile}`, { method: "DELETE" });
      showToast("Arquivo excluído");
      await loadStorage();
    });
  });
}

async function loadAssets() {
  const assets = await api("/assets");
  const tbody = $("#assets-table");

  tbody.innerHTML = assets.length
    ? assets
        .map(
          (a) => `
      <tr>
        <td>${esc(a.name)}</td>
        <td><code>${esc(a.path)}</code></td>
        <td>${a.type}</td>
        <td>${a.duration ? `${a.duration}s` : "—"}</td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="empty">Nenhum asset</td></tr>';

  return assets;
}

async function loadPlaylists() {
  const channelId = getSelectedChannelId();
  const container = $("#playlists-list");
  const playoutSelect = $("#playout-playlist");

  if (!channelId) {
    container.innerHTML = '<p class="empty">Selecione um canal no topo.</p>';
    playoutSelect.innerHTML = '<option value="">— playlist —</option>';
    return;
  }

  const playlists = await api(`/channels/${channelId}/playlists`);
  const assets = await api("/assets");

  playoutSelect.innerHTML =
    '<option value="">— playlist —</option>' +
    playlists.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");

  if (!playlists.length) {
    container.innerHTML = '<p class="empty">Nenhuma playlist neste canal.</p>';
    return;
  }

  container.innerHTML = playlists
    .map((pl) => {
      const items = pl.items
        .sort((a, b) => a.order - b.order)
        .map((item) => {
          const asset = assets.find((a) => a.id === item.assetId);
          return `<li><span>${esc(asset?.name ?? item.assetId)}</span>
            <button class="btn btn-sm btn-danger" data-rm-item="${pl.id}" data-asset-id="${item.assetId}">×</button></li>`;
        })
        .join("");

      const assetOptions = assets
        .filter((a) => !pl.items.some((i) => i.assetId === a.id))
        .map((a) => `<option value="${a.id}">${esc(a.name)}</option>`)
        .join("");

      return `
      <div class="playlist-card" data-pl="${pl.id}">
        <header>
          <strong>${esc(pl.name)}</strong>
          <button class="btn btn-sm btn-danger" data-del-pl="${pl.id}">Excluir</button>
        </header>
        <ul class="playlist-items">${items || '<li class="empty">Vazia</li>'}</ul>
        <div class="add-item-row">
          <select data-add-select="${pl.id}"><option value="">+ adicionar asset</option>${assetOptions}</select>
        </div>
      </div>`;
    })
    .join("");

  container.querySelectorAll("[data-del-pl]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir playlist?")) return;
      await api(`/playlists/${btn.dataset.delPl}`, { method: "DELETE" });
      showToast("Playlist excluída");
      await loadPlaylists();
    });
  });

  container.querySelectorAll("[data-rm-item]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/playlists/${btn.dataset.rmItem}/items/${btn.dataset.assetId}`, { method: "DELETE" });
      showToast("Item removido");
      await loadPlaylists();
    });
  });

  container.querySelectorAll("[data-add-select]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      if (!sel.value) return;
      await api(`/playlists/${sel.dataset.addSelect}/items`, {
        method: "POST",
        body: { assetId: sel.value },
      });
      showToast("Asset adicionado");
      await loadPlaylists();
    });
  });
}

async function loadPlayoutStatus() {
  const channelId = getSelectedChannelId();
  const panel = $("#playout-status");

  if (!channelId) {
    panel.innerHTML = "<p>Selecione um canal.</p>";
    return;
  }

  const status = await api(`/channels/${channelId}/playout`);

  panel.innerHTML = `
    <p><span class="label">Status:</span> ${statusBadge(status.status)}</p>
    <p><span class="label">Playlist:</span> ${esc(status.playlistName ?? "—")}</p>
    <p><span class="label">Item:</span> ${status.currentItem ? esc(status.currentItem.assetName) : "—"}</p>
    <p><span class="label">Posição:</span> ${status.currentIndex >= 0 ? `${status.currentIndex + 1} / ${status.queue.length}` : "—"}</p>
    <p><span class="label">Engine:</span> ${status.engineMode ?? "—"}</p>
    <p><span class="label">Saída:</span> ${esc(status.outputTarget ?? "—")}</p>
  `;

  updateHlsPlayer(channelId, status.status);
  setupPolling(status.status);
}

function setupPolling(status) {
  clearInterval(pollTimer);
  if (status === "playing" || status === "paused") {
    pollTimer = setInterval(() => loadPlayoutStatus().catch(() => {}), 2000);
  }
}

function updateHlsPlayer(channelId, status) {
  const video = $("#hls-player");
  const urlLabel = $("#hls-url");
  const hlsUrl = `/channels/${channelId}/hls/stream.m3u8`;

  urlLabel.textContent = hlsUrl;

  if (status !== "playing" && status !== "paused") {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    video.removeAttribute("src");
    video.load();
    return;
  }

  if (Hls.isSupported()) {
    if (hlsInstance) hlsInstance.destroy();
    hlsInstance = new Hls({ liveDurationInfinity: true });
    hlsInstance.loadSource(hlsUrl);
    hlsInstance.attachMedia(video);
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = hlsUrl;
  }
}

async function uploadFile(file) {
  const progress = $("#upload-progress");
  progress.classList.remove("hidden");
  progress.textContent = `Enviando ${file.name}...`;

  const form = new FormData();
  form.append("file", file);

  try {
    const result = await api("/storage/upload", { method: "POST", body: form });
    progress.textContent = `Upload concluído: ${result.filename}`;
    showToast("Upload concluído");
    await loadStorage();
  } catch (err) {
    progress.textContent = `Erro: ${err.message}`;
    showToast(err.message, "error");
  }
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function switchView(name) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  $$(".nav-btn").forEach((b) => b.classList.remove("active"));
  $(`#view-${name}`).classList.add("active");
  $(`.nav-btn[data-view="${name}"]`).classList.add("active");
}

async function refreshAll() {
  await loadChannels();
  await loadStorage();
  await loadAssets();
  await loadPlaylists();
  await loadPlayoutStatus();
}

function bindEvents() {
  $("#api-key").value = getApiKey();

  $("#save-key").addEventListener("click", async () => {
    localStorage.setItem(STORAGE_KEY, $("#api-key").value.trim());
    showToast("API key salva");
    await checkConnection();
    await refreshAll();
  });

  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  $("#channel-select").addEventListener("change", async () => {
    setSelectedChannelId($("#channel-select").value);
    await loadPlaylists();
    await loadPlayoutStatus();
  });

  $("#channel-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      name: fd.get("name"),
      description: fd.get("description") || undefined,
      outputUrl: fd.get("outputUrl") || undefined,
    };
    await api("/channels", { method: "POST", body });
    e.target.reset();
    showToast("Canal criado");
    await loadChannels();
  });

  $("#playlist-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const channelId = getSelectedChannelId();
    if (!channelId) { showToast("Selecione um canal", "error"); return; }
    const fd = new FormData(e.target);
    await api("/playlists", { method: "POST", body: { channelId, name: fd.get("name") } });
    e.target.reset();
    showToast("Playlist criada");
    await loadPlaylists();
  });

  $("#refresh-channels").addEventListener("click", () => loadChannels().catch(handleError));
  $("#refresh-media").addEventListener("click", () => Promise.all([loadStorage(), loadAssets()]).catch(handleError));
  $("#refresh-playlists").addEventListener("click", () => loadPlaylists().catch(handleError));
  $("#refresh-playout").addEventListener("click", () => loadPlayoutStatus().catch(handleError));

  $("#playout-start").addEventListener("click", async () => {
    const channelId = getSelectedChannelId();
    const playlistId = $("#playout-playlist").value;
    if (!channelId || !playlistId) { showToast("Selecione canal e playlist", "error"); return; }
    await api(`/channels/${channelId}/playout/start`, { method: "POST", body: { playlistId } });
    showToast("Playout iniciado");
    await loadPlayoutStatus();
  });

  for (const [id, action] of [
    ["playout-pause", "pause"],
    ["playout-resume", "resume"],
    ["playout-skip", "skip"],
    ["playout-stop", "stop"],
  ]) {
    $(`#${id}`).addEventListener("click", async () => {
      const channelId = getSelectedChannelId();
      if (!channelId) return;
      await api(`/channels/${channelId}/playout/${action}`, { method: "POST", body: {} });
      showToast(`Playout: ${action}`);
      await loadPlayoutStatus();
    });
  }

  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) uploadFile(fileInput.files[0]);
  });
}

function handleError(err) {
  showToast(err.message, "error");
}

async function init() {
  bindEvents();
  await checkConnection();
  try {
    await refreshAll();
  } catch (err) {
    handleError(err);
  }
}

init();
