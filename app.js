/* ============================================================
   ÁLBUM COPA 2026 — APP
   ============================================================ */

const SUPABASE_URL = "https://jekmtuoxbzryykarfnbf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impla210dW94YnpyeXlrYXJmbmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2ODEzNTQsImV4cCI6MjA5MzI1NzM1NH0.zFz6A-q_1aKyTMz0wfFYlrGTP5lfI10OFt-rFEYOlMs";

const STORAGE_PROGRESS_PREFIX = "albumCopa2026:progress:";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let state = {
  user: null,
  collected: new Set(),
};
let saveTimer = null;

/* --------------------------------------------
   Boot
   -------------------------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
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

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session) {
    await enterAppForSession(session);
  } else {
    showLogin();
  }
});

/* --------------------------------------------
   Auth (Supabase)
   -------------------------------------------- */
async function handleLogin(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  if (!email || !password) return;

  const submitBtn = form.querySelector("button[type=submit]");
  const original = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = "Entrando...";

  let { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error && /invalid login credentials/i.test(error.message)) {
    const signUpRes = await sb.auth.signUp({ email, password });
    if (signUpRes.error) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = original;
      alert("Erro ao criar conta: " + signUpRes.error.message);
      return;
    }
    if (!signUpRes.data.session) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = original;
      alert(
        "Conta criada, mas o Supabase pediu confirmação por e-mail.\n\n" +
          "Vá em Authentication → Providers → Email no dashboard e desligue 'Confirm email'."
      );
      return;
    }
    data = signUpRes.data;
  } else if (error) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = original;
    alert("Erro: " + error.message);
    return;
  }

  await enterAppForSession(data.session);
  submitBtn.disabled = false;
  submitBtn.innerHTML = original;
  form.reset();
}

async function enterAppForSession(session) {
  state.user = { email: session.user.email, id: session.user.id };

  let collected = await loadProgressFromCloud();

  const localKey = STORAGE_PROGRESS_PREFIX + state.user.email;
  if (collected.length === 0) {
    try {
      const localRaw = localStorage.getItem(localKey);
      const local = localRaw ? JSON.parse(localRaw) : [];
      if (Array.isArray(local) && local.length > 0) {
        await saveProgressToCloud(local);
        collected = local;
      }
    } catch {}
  }

  state.collected = new Set(collected);
  localStorage.setItem(localKey, JSON.stringify(collected));
  showApp();
}

async function handleLogout() {
  await sb.auth.signOut();
  state = { user: null, collected: new Set() };
  showLogin();
}

/* --------------------------------------------
   Progress storage (Supabase + localStorage cache)
   -------------------------------------------- */
async function loadProgressFromCloud() {
  if (!state.user) return [];
  const { data, error } = await sb
    .from("progress")
    .select("collected")
    .eq("user_id", state.user.id)
    .maybeSingle();
  if (error) {
    console.warn("[progress] cloud load failed, using cache:", error.message);
    try {
      const raw = localStorage.getItem(
        STORAGE_PROGRESS_PREFIX + state.user.email
      );
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  return data?.collected || [];
}

async function saveProgressToCloud(arr) {
  if (!state.user) return;
  const { error } = await sb.from("progress").upsert({
    user_id: state.user.id,
    collected: arr,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[progress] cloud save failed:", error.message);
}

function writeProgress() {
  if (!state.user) return;
  const arr = Array.from(state.collected);
  localStorage.setItem(
    STORAGE_PROGRESS_PREFIX + state.user.email,
    JSON.stringify(arr)
  );
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProgressToCloud(arr), 600);
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
