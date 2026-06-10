const CONFIG = {
  owner: "dreamstation1",
  repo: "gallery",
  branch: "main",
  photoDir: "photos"
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
const searchInput = $("searchInput");
const refreshBtn = $("refreshBtn");
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

function getExt(name) {
  const lower = name.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx >= 0 ? lower.slice(idx) : "";
}

function isSupported(name) {
  const ext = getExt(name);
  return IMAGE_EXT.includes(ext) || VIDEO_EXT.includes(ext) || FILE_EXT.includes(ext);
}

function rawUrl(path) {
  return `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${encodeURIComponent(path).replaceAll("%2F", "/")}`;
}

async function fetchContents(path) {
  const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}?ref=${CONFIG.branch}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`GitHub API 오류: ${res.status}`);
  }

  return await res.json();
}

async function walk(path) {
  const list = await fetchContents(path);
  let result = [];

  for (const item of list) {
    if (item.type === "dir") {
      const inner = await walk(item.path);
      result = result.concat(inner);
    }

    if (item.type === "file" && isSupported(item.name)) {
      const relative = item.path.replace(`${CONFIG.photoDir}/`, "");
      const parts = relative.split("/");
      const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "기본";

      result.push({
        name: item.name,
        path: item.path,
        folder,
        url: rawUrl(item.path),
        ext: getExt(item.name)
      });
    }
  }

  return result;
}

async function loadPhotos() {
  grid.innerHTML = "";
  countText.textContent = "불러오는 중";
  empty.classList.add("hidden");

  try {
    allItems = await walk(CONFIG.photoDir);
    folders = [...new Set(allItems.map(item => item.folder))].sort();

    syncFolders();
    renderGallery();
    renderFolders();
  } catch (err) {
    console.error(err);
    countText.textContent = "불러오기 실패";
    grid.innerHTML = `
      <div class="empty show-error">
        photos 폴더가 없거나 저장소 이름 설정이 다릅니다.<br>
        app.js의 owner, repo를 확인하세요.
      </div>
    `;
  }
}

function syncFolders() {
  folderSelect.innerHTML = `<option value="">전체</option>` + folders.map(folder => {
    return `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`;
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
    media = `<img src="${item.url}" loading="lazy" alt="">`;
  } else if (VIDEO_EXT.includes(item.ext)) {
    media = `<video src="${item.url}" muted loading="lazy"></video>`;
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
  let media = `<iframe src="${item.url}"></iframe>`;

  if (IMAGE_EXT.includes(item.ext)) {
    media = `<img src="${item.url}" alt="">`;
  } else if (VIDEO_EXT.includes(item.ext)) {
    media = `<video src="${item.url}" controls autoplay></video>`;
  }

  viewerBody.innerHTML = `
    <div class="viewer-media">${media}</div>
    <div class="viewer-info">
      <h2>${escapeHtml(cleanName(item.name))}</h2>
      <p>${escapeHtml(item.folder)}</p>
      <a href="${item.url}" target="_blank" rel="noreferrer">원본 열기</a>
    </div>
  `;

  viewer.showModal();
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
