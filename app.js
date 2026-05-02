/* ============================================================
   ÁLBUM COPA 2026 — APP
   ============================================================ */

const STORAGE_AUTH = "albumCopa2026:auth";
const STORAGE_PROGRESS_PREFIX = "albumCopa2026:progress:";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let state = {
  user: null,
  collected: new Set(),
};

/* --------------------------------------------
   Boot
   -------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const auth = readAuth();
  if (auth) {
    state.user = auth;
    state.collected = new Set(readProgress(auth.email));
    showApp();
  } else {
    showLogin();
  }
  twemojiParse(document.body);

  $("#login-form").addEventListener("submit", handleLogin);
  $("#logout-btn").addEventListener("click", handleLogout);
  $("#celebration-close").addEventListener("click", closeCelebration);
  $("#export-btn").addEventListener("click", exportProgress);
  $("#import-btn").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importProgress(file);
    e.target.value = "";
  });
});

/* --------------------------------------------
   Auth
   -------------------------------------------- */
function readAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeAuth(auth) {
  localStorage.setItem(STORAGE_AUTH, JSON.stringify(auth));
}

function clearAuth() {
  localStorage.removeItem(STORAGE_AUTH);
}

function handleLogin(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  if (!email || !password) return;

  const auth = { email, since: Date.now() };
  writeAuth(auth);
  state.user = auth;
  state.collected = new Set(readProgress(email));
  showApp();
}

function handleLogout() {
  clearAuth();
  state = { user: null, collected: new Set() };
  showLogin();
}

/* --------------------------------------------
   Progress storage
   -------------------------------------------- */
function progressKey(email) {
  return STORAGE_PROGRESS_PREFIX + email;
}

function readProgress(email) {
  try {
    const raw = localStorage.getItem(progressKey(email));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeProgress() {
  if (!state.user) return;
  localStorage.setItem(
    progressKey(state.user.email),
    JSON.stringify(Array.from(state.collected))
  );
}

/* --------------------------------------------
   Backup / Restore
   -------------------------------------------- */
function exportProgress() {
  if (!state.user) return;
  const payload = {
    schema: "album-copa-2026/v1",
    email: state.user.email,
    exportedAt: new Date().toISOString(),
    total: state.collected.size,
    collected: Array.from(state.collected).sort(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  const safeEmail = state.user.email.replace(/[^a-z0-9]/gi, "_");
  a.href = url;
  a.download = `album-copa-2026-${safeEmail}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importProgress(file) {
  if (!state.user) return;
  let data;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch {
    alert("Arquivo inválido — não é um JSON.");
    return;
  }
  if (!data || !Array.isArray(data.collected)) {
    alert("Arquivo inválido — não tem a lista de figurinhas.");
    return;
  }

  const incoming = data.collected.filter((c) => typeof c === "string");
  const before = state.collected.size;
  const mode = confirm(
    `Encontrei ${incoming.length} figurinhas no backup.\n\n` +
      `OK   = mesclar (mantém suas atuais + adiciona as do backup)\n` +
      `Cancelar = substituir (apaga as atuais e fica só com as do backup)`
  );

  if (mode) {
    incoming.forEach((c) => state.collected.add(c));
  } else {
    state.collected = new Set(incoming);
  }

  writeProgress();
  renderNav();
  renderAlbum();
  updateOverallProgress();
  alert(
    `Pronto! ${state.collected.size} figurinhas no álbum agora ` +
      `(antes: ${before}).`
  );
}

/* --------------------------------------------
   Views
   -------------------------------------------- */
function showLogin() {
  $("#login-screen").classList.remove("hidden");
  $("#app").classList.add("hidden");
}

function showApp() {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#user-chip").textContent = state.user.email;
  renderNav();
  renderAlbum();
  updateOverallProgress();
  twemojiParse(document.body);
}

/* --------------------------------------------
   Render: Section Nav (chips)
   -------------------------------------------- */
function renderNav() {
  const nav = $("#section-nav");
  nav.innerHTML = "";
  ALBUM.sections.forEach((section) => {
    const chip = document.createElement("button");
    chip.className = "nav-chip";
    chip.dataset.section = section.id;
    const collected = countCollected(section);
    const total = section.stickers.length;
    if (collected === total) chip.classList.add("is-complete");

    chip.innerHTML = `
      <span class="nav-flag">${section.flag}</span>
      <span>${section.name}</span>
      <span class="nav-count">${collected}/${total}</span>
    `;

    chip.addEventListener("click", () => {
      const target = document.getElementById(`section-${section.id}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    nav.appendChild(chip);
  });
}

function refreshNavChip(section) {
  const chip = $(`.nav-chip[data-section="${section.id}"]`);
  if (!chip) return;
  const collected = countCollected(section);
  const total = section.stickers.length;
  $(".nav-count", chip).textContent = `${collected}/${total}`;
  chip.classList.toggle("is-complete", collected === total);
}

/* --------------------------------------------
   Render: Album sections + stickers
   -------------------------------------------- */
function renderAlbum() {
  const album = $("#album");
  album.innerHTML = "";
  ALBUM.sections.forEach((section, idx) => {
    album.appendChild(renderSection(section, idx));
  });
  twemojiParse(album);
}

function renderSection(section, idx) {
  const wrap = document.createElement("section");
  wrap.className = "section";
  wrap.id = `section-${section.id}`;
  wrap.dataset.section = section.id;

  const collected = countCollected(section);
  const total = section.stickers.length;
  if (collected === total) wrap.classList.add("is-complete");

  const sectionNumber = String(idx + 1).padStart(2, "0");

  wrap.innerHTML = `
    <header class="section-header">
      <div class="section-flag">${section.flag}</div>
      <div class="section-meta">
        <span class="section-code">Seção ${sectionNumber} · ${section.code}</span>
        <h2 class="section-name">${section.name}</h2>
      </div>
      <div class="section-progress">
        <div class="section-progress-text">
          <span data-role="section-collected">${collected}</span>/<span>${total}</span>
          <em>${Math.round((collected / total) * 100)}%</em>
        </div>
        <div class="section-progress-bar">
          <div class="section-progress-fill" style="width:${(collected / total) * 100}%"></div>
        </div>
      </div>
    </header>
    <div class="sticker-grid"></div>
  `;

  const grid = $(".sticker-grid", wrap);
  section.stickers.forEach((sticker) => {
    grid.appendChild(renderSticker(section, sticker));
  });

  return wrap;
}

function renderSticker(section, sticker) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "sticker";
  card.dataset.code = sticker.code;
  if (state.collected.has(sticker.code)) card.classList.add("is-collected");

  card.innerHTML = `
    <div class="sticker-flag">${section.flag}</div>
    <div class="sticker-meta">
      <span class="sticker-code">${sticker.code}</span>
      <span class="sticker-name">${escapeHtml(sticker.name)}</span>
    </div>
    <div class="stamp">COLADA</div>
  `;

  card.addEventListener("click", () => toggleSticker(section, sticker, card));
  return card;
}

/* --------------------------------------------
   Toggle sticker
   -------------------------------------------- */
function toggleSticker(section, sticker, card) {
  const wasCollected = state.collected.has(sticker.code);
  if (wasCollected) {
    state.collected.delete(sticker.code);
    card.classList.remove("is-collected");
  } else {
    state.collected.add(sticker.code);
    card.classList.add("is-collected", "just-collected");
    setTimeout(() => card.classList.remove("just-collected"), 320);
  }

  writeProgress();
  refreshSectionProgress(section);
  refreshNavChip(section);
  updateOverallProgress();

  if (!wasCollected && countCollected(section) === section.stickers.length) {
    onSectionComplete(section);
  }
}

function refreshSectionProgress(section) {
  const wrap = document.getElementById(`section-${section.id}`);
  if (!wrap) return;
  const collected = countCollected(section);
  const total = section.stickers.length;
  $('[data-role="section-collected"]', wrap).textContent = collected;
  $(".section-progress-fill", wrap).style.width = `${(collected / total) * 100}%`;
  $(".section-progress-text em", wrap).textContent = `${Math.round((collected / total) * 100)}%`;
  wrap.classList.toggle("is-complete", collected === total);
}

function updateOverallProgress() {
  const total = ALBUM.totalStickers;
  const collected = state.collected.size;
  const missing = total - collected;
  const percent = Math.round((collected / total) * 100);
  $("#stat-collected").textContent = collected;
  $("#stat-missing").textContent = missing;
  $("#stat-percent").textContent = `${percent}%`;
  $("#progress-fill").style.width = `${(collected / total) * 100}%`;
}

function countCollected(section) {
  let n = 0;
  for (const s of section.stickers) {
    if (state.collected.has(s.code)) n++;
  }
  return n;
}

/* --------------------------------------------
   Celebration
   -------------------------------------------- */
function onSectionComplete(section) {
  $("#celebration-section").textContent = section.name;
  const modal = $("#celebration");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  fireConfetti();
  twemojiParse($(".celebration-card"));
}

function closeCelebration() {
  const modal = $("#celebration");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function fireConfetti() {
  if (typeof confetti !== "function") return;
  const colors = ["#0e8c5b", "#c44536", "#d4a04a", "#1f3556", "#f1ece0"];
  const burst = (origin) =>
    confetti({
      particleCount: 110,
      spread: 80,
      startVelocity: 55,
      origin,
      colors,
      ticks: 220,
      scalar: 1.05,
    });
  burst({ x: 0.2, y: 0.5 });
  burst({ x: 0.5, y: 0.4 });
  burst({ x: 0.8, y: 0.5 });
  setTimeout(() => burst({ x: 0.5, y: 0.3 }), 220);
}

/* --------------------------------------------
   Helpers
   -------------------------------------------- */
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function twemojiParse(node) {
  if (typeof twemoji === "undefined" || !node) return;
  twemoji.parse(node, {
    folder: "svg",
    ext: ".svg",
    base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
  });
}
