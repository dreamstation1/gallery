const CONFIG = {
  apiBase: "https://gallery-api.docheonmetro.workers.dev"
};

const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const VIDEO_EXT = [".mp4", ".webm", ".mov"];
const FILE_EXT = [".pdf"];

let allItems = [];
let folders = [];
let currentFolder = "";
let searchText = "";

const $ = (id) => document.getElementById(id);

const grid = $("grid");
const empty = $("empty");
const countText = $("countText");
const folderCount = $("folderCount");
const folderGrid = $("folderGrid");
const folderSelect = $("folderSelect");
const folderList = $("folderList");
const searchInput = $("searchInput");
const refreshBtn = $("refreshBtn");
const uploadForm = $("uploadForm");
const uploadFolder = $("uploadFolder");
const fileInput = $("fileInput");
const uploadBtn = $("uploadBtn");
const uploadStatus = $("uploadStatus");
const uploadPassword = $("uploadPassword");
const viewer = $("viewer");
const viewerBody = $("viewerBody");
const closeViewer = $("closeViewer");

document.querySelectorAll(".nav, .mobile-nav").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("show"));
  document.getElementById(id).classList.add("show");

  document.querySelectorAll(".nav, .mobile-nav").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === id);
  });
}

searchInput.addEventListener("input", () => {
  searchText = searchInput.value.trim().toLowerCase();
  renderGallery();
});

folderSelect.addEventListener("change", () => {
  currentFolder = folderSelect.value;
  renderGallery();
});

refreshBtn.addEventListener("click", loadPhotos);
closeViewer.addEventListener("click", () => viewer.close());

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!fileInput.files.length) {
    setUploadStatus("저장할 사진을 먼저 선택해 주세요.", true);
    return;
  }

  if (!uploadPassword.value.trim()) {
    setUploadStatus("업로드 비밀번호를 입력해 주세요.", true);
    return;
  }

  uploadBtn.disabled = true;
  setUploadStatus("저장하는 중...");

  try {
    const files = [...fileInput.files];
    const saved = await uploadToCloudflare(files, uploadFolder.value.trim());

    setUploadStatus(`${saved}개 저장 완료`);
    fileInput.value = "";
    uploadPassword.value = "";
    await loadPhotos();
    showView("gallery");
  } catch (err) {
    console.error(err);
    setUploadStatus(err.message || "업로드 실패", true);
  } finally {
    uploadBtn.disabled = false;
  }
});

async function uploadToCloudflare(files, folder) {
  ensureApiBase();

  const formData = new FormData();
  formData.append("folder", folder);
  formData.append("password", uploadPassword.value.trim());

  let fileCount = 0;
  for (const file of files) {
    if (!isSupported(file.name)) continue;
    formData.append("files", file);
    fileCount += 1;
  }

  if (fileCount === 0) throw new Error("저장 가능한 파일이 없습니다.");

  const res = await fetch(`${CONFIG.apiBase}/upload`, {
    method: "POST",
    body: formData
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `업로드 실패: ${res.status}`);

  return data.saved || fileCount;
}

async function loadPhotos() {
  grid.innerHTML = "";
  countText.textContent = "불러오는 중";
  empty.classList.add("hidden");

  try {
    ensureApiBase();
    const res = await fetch(`${CONFIG.apiBase}/items`, { cache: "no-store" });
    if (!res.ok) throw new Error(`목록 불러오기 실패: ${res.status}`);

    allItems = await res.json();
    folders = [...new Set(allItems.map(item => item.folder))].sort((a, b) => a.localeCompare(b, "ko"));
    syncFolders();
    renderGallery();
    renderFolders();
    setUploadStatus("Cloudflare R2 업로드 모드입니다.");
  } catch (err) {
    console.error(err);
    countText.textContent = "불러오기 실패";
    grid.innerHTML = `
      <div class="empty show-error">
        사진을 불러오지 못했습니다.<br>
        app.js의 Cloudflare Worker 주소를 확인해 주세요.
      </div>
    `;
  }
}

function ensureApiBase() {
  if (CONFIG.apiBase.includes("YOUR-WORKER-NAME")) {
    throw new Error("app.js의 apiBase를 Cloudflare Worker 주소로 바꿔 주세요.");
  }
}

function syncFolders() {
  folderSelect.innerHTML = `<option value="">전체</option>` + folders.map(folder => {
    return `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`;
  }).join("");

  folderList.innerHTML = folders.map(folder => {
    return `<option value="${escapeHtml(folder)}"></option>`;
  }).join("");
}

function filteredItems() {
  return allItems.filter(item => {
    const searchOk = !searchText || `${item.name} ${item.folder}`.toLowerCase().includes(searchText);
    const folderOk = !currentFolder || item.folder === currentFolder;
    return searchOk && folderOk;
  });
}

function renderGallery() {
  const items = filteredItems();
  countText.textContent = `${items.length}개`;
  empty.classList.toggle("hidden", items.length !== 0);

  grid.innerHTML = items.map(item => cardHtml(item)).join("");

  grid.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => {
      const item = allItems.find(x => x.path === card.dataset.path);
      if (item) openViewer(item);
    });
  });
}

function cardHtml(item) {
  let media = `<div class="file">파일</div>`;

  if (IMAGE_EXT.includes(item.ext)) {
    media = `<img src="${absoluteUrl(item.url)}" loading="lazy" alt="">`;
  } else if (VIDEO_EXT.includes(item.ext)) {
    media = `<video src="${absoluteUrl(item.url)}" muted loading="lazy"></video>`;
  } else if (item.ext === ".pdf") {
    media = `<div class="file">PDF</div>`;
  }

  return `
    <article class="card" data-path="${escapeHtml(item.path)}">
      <div class="thumb">${media}</div>
      <div class="meta">
        <p>${escapeHtml(item.folder)}</p>
        <h3>${escapeHtml(cleanName(item.name))}</h3>
      </div>
    </article>
  `;
}

function renderFolders() {
  folderCount.textContent = `${folders.length}개`;

  folderGrid.innerHTML = folders.map(folder => {
    const count = allItems.filter(item => item.folder === folder).length;
    return `
      <article class="folder-card" data-folder="${escapeHtml(folder)}">
        <span></span>
        <div>
          <h3>${escapeHtml(folder)}</h3>
          <p>${count}개</p>
        </div>
      </article>
    `;
  }).join("");

  folderGrid.querySelectorAll(".folder-card").forEach(card => {
    card.addEventListener("click", () => {
      currentFolder = card.dataset.folder;
      folderSelect.value = currentFolder;
      showView("gallery");
      renderGallery();
    });
  });
}

function openViewer(item) {
  let media = `<iframe src="${absoluteUrl(item.url)}"></iframe>`;

  if (IMAGE_EXT.includes(item.ext)) {
    media = `<img src="${absoluteUrl(item.url)}" alt="">`;
  } else if (VIDEO_EXT.includes(item.ext)) {
    media = `<video src="${absoluteUrl(item.url)}" controls autoplay></video>`;
  }

  viewerBody.innerHTML = `
    <div class="viewer-media">${media}</div>
    <div class="viewer-info">
      <h2>${escapeHtml(cleanName(item.name))}</h2>
      <p>${escapeHtml(item.folder)}</p>
      <a href="${absoluteUrl(item.url)}" target="_blank" rel="noreferrer">원본 열기</a>
    </div>
  `;

  viewer.showModal();
}

function absoluteUrl(url) {
  if (url.startsWith("http")) return url;
  return `${CONFIG.apiBase}${url}`;
}

function setUploadStatus(text, isError = false) {
  uploadStatus.textContent = text;
  uploadStatus.classList.toggle("error", isError);
}

function getExt(name) {
  const lower = name.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx >= 0 ? lower.slice(idx) : "";
}

function isSupported(name) {
  const ext = getExt(name);
  return IMAGE_EXT.includes(ext) || VIDEO_EXT.includes(ext) || FILE_EXT.includes(ext);
}

function cleanName(name) {
  return name.replace(/\.[^/.]+$/, "");
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadPhotos();
