const CONFIG = {
  owner: "dreamstation1",
  repo: "gallery",
  branch: "main",
  photoDir: "photos"
};

const GITHUB_TOKEN = "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";

const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const VIDEO_EXT = [".mp4", ".webm", ".mov"];
const FILE_EXT = [".pdf"];

let allItems = [];
let folders = [];
let currentFolder = "";
let searchText = "";
let useLocalApi = true;

const IS_LOCAL_SERVER =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.hostname === "";

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

const UPLOAD_PASSWORD_HASH = "8797d0ddf0f02784b207fe18c89ac3bbc801b037c0d6f0e03a8051772d623c54";

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

  if (!await isUploadPasswordOk()) {
    setUploadStatus("업로드 비밀번호가 틀렸습니다.", true);
    return;
  }

  if (!fileInput.files.length) {
    setUploadStatus("저장할 사진을 먼저 선택해 주세요.", true);
    return;
  }

  uploadBtn.disabled = true;
  setUploadStatus("저장하는 중...");

  try {
    const files = [...fileInput.files];
    const saved = useLocalApi
      ? await uploadToLocal(files)
      : await uploadToGithub(files, uploadFolder.value.trim());

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

async function isUploadPasswordOk() {
  const input = uploadPassword.value.trim();
  if (!input) return false;

  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  return hash === UPLOAD_PASSWORD_HASH;
}

async function uploadToLocal(files) {
  const formData = new FormData();
  formData.append("folder", uploadFolder.value.trim());

  for (const file of files) {
    formData.append("files", file);
  }

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "업로드 실패");
  return data.saved;
}

async function uploadToGithub(files, folder) {
  const token = GITHUB_TOKEN.trim();
  if (!token) {
    throw new Error("app.js의 GITHUB_TOKEN 빈칸에 GitHub 토큰을 넣어 주세요.");
  }

  let saved = 0;
  for (const file of files) {
    if (!isSupported(file.name)) continue;

    const path = githubUploadPath(folder, file.name);
    const content = await fileToBase64(file);
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${encodeGitHubPath(path)}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Upload ${file.name}`,
        content,
        branch: CONFIG.branch
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error("GitHub 토큰이 틀렸거나 무효화됐습니다. 새 토큰을 만들어 app.js의 GITHUB_TOKEN에 다시 넣어 주세요.");
      }
      if (res.status === 403) {
        throw new Error("GitHub 토큰 권한이 부족합니다. Contents 권한을 Read and write로 설정해 주세요.");
      }
      throw new Error(data.message || `GitHub 업로드 실패: ${res.status}`);
    }

    saved += 1;
    setUploadStatus(`${saved}/${files.length}개 GitHub에 저장 중...`);
  }

  if (saved === 0) throw new Error("저장 가능한 파일이 없습니다.");
  return saved;
}

function githubUploadPath(folder, filename) {
  const folderPath = normalizeFolder(folder);
  const safeName = safeFileName(filename);
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
  return `${CONFIG.photoDir}/${folderPath}/${stamp}_${safeName}`;
}

function normalizeFolder(folder) {
  return (folder || "기본")
    .split(/[\\/]+/)
    .map(part => safeFileName(part).replace(/\.[^/.]+$/, ""))
    .filter(Boolean)
    .join("/") || "기본";
}

function safeFileName(name) {
  return (name || "file")
    .replace(/[<>:"\\|?*\u0000-\u001f]/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .trim() || "file";
}

function encodeGitHubPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
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

async function loadLocalPhotos() {
  const res = await fetch("/api/items", { cache: "no-store" });
  if (!res.ok) throw new Error("로컬 API 없음");
  return await res.json();
}

async function loadPhotos() {
  grid.innerHTML = "";
  countText.textContent = "불러오는 중";
  empty.classList.add("hidden");

  if (IS_LOCAL_SERVER) {
    try {
      allItems = await loadLocalPhotos();
      useLocalApi = true;
      folders = [...new Set(allItems.map(item => item.folder))].sort((a, b) => a.localeCompare(b, "ko"));
      syncFolders();
      renderGallery();
      renderFolders();
      return;
    } catch (localErr) {
      console.warn("로컬 API를 찾지 못해 GitHub에서 사진을 불러옵니다.", localErr);
    }
  }

  try {
    allItems = await walk(CONFIG.photoDir);
    useLocalApi = false;
    setUploadStatus("GitHub 업로드 모드입니다. app.js의 GITHUB_TOKEN 값이 필요합니다.");
  } catch (err) {
    console.error(err);
    countText.textContent = "불러오기 실패";
    grid.innerHTML = `
      <div class="empty show-error">
        사진을 불러오지 못했습니다.<br>
        저장소 이름과 photos 폴더를 확인해 주세요.
      </div>
    `;
    return;
  }

  folders = [...new Set(allItems.map(item => item.folder))].sort((a, b) => a.localeCompare(b, "ko"));
  syncFolders();
  renderGallery();
  renderFolders();
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
