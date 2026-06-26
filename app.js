const CONFIG = {
  apiBase: "https://gallery-api.docheonmetro.workers.dev"
};

const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const VIDEO_EXT = [".mp4", ".webm", ".mov"];
const FILE_EXT = [".pdf"];
const NEW_FOLDER_VALUE = "__new__";

let allItems = [];
let folders = [];
let folderCovers = {};
let currentFolder = "";
let searchText = "";
let manageMode = false;
const selectedPaths = new Set();

const $ = (id) => document.getElementById(id);

const grid = $("grid");
const empty = $("empty");
const countText = $("countText");
const folderCount = $("folderCount");
const folderGrid = $("folderGrid");
const folderSelect = $("folderSelect");
const coverForm = $("coverForm");
const coverFolderSelect = $("coverFolderSelect");
const coverFolderNew = $("coverFolderNew");
const coverFileInput = $("coverFileInput");
const coverPassword = $("coverPassword");
const coverBtn = $("coverBtn");
const searchInput = $("searchInput");
const refreshBtn = $("refreshBtn");
const manageBtn = $("manageBtn");
const managePanel = $("managePanel");
const selectedCount = $("selectedCount");
const moveFolderSelect = $("moveFolderSelect");
const moveFolderNew = $("moveFolderNew");
const managePassword = $("managePassword");
const selectAllBtn = $("selectAllBtn");
const watermarkBtn = $("watermarkBtn");
const downloadBtn = $("downloadBtn");
const moveBtn = $("moveBtn");
const deleteBtn = $("deleteBtn");
const uploadForm = $("uploadForm");
const uploadFolderSelect = $("uploadFolderSelect");
const uploadFolderNewWrap = $("uploadFolderNewWrap");
const uploadFolderNew = $("uploadFolderNew");
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

uploadFolderSelect.addEventListener("change", syncFolderInputs);
moveFolderSelect.addEventListener("change", syncFolderInputs);
coverFolderSelect.addEventListener("change", syncFolderInputs);
refreshBtn.addEventListener("click", loadPhotos);
closeViewer.addEventListener("click", () => viewer.close());
manageBtn.addEventListener("click", toggleManageMode);
selectAllBtn.addEventListener("click", selectAllVisible);
watermarkBtn.addEventListener("click", watermarkSelected);
downloadBtn.addEventListener("click", downloadSelected);
moveBtn.addEventListener("click", moveSelected);
deleteBtn.addEventListener("click", deleteSelected);
coverForm.addEventListener("submit", saveFolderCover);

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

  const folder = getChosenFolder(uploadFolderSelect, uploadFolderNew);
  if (!folder) {
    setUploadStatus("폴더를 선택하거나 새 폴더명을 입력해 주세요.", true);
    return;
  }

  uploadBtn.disabled = true;
  setUploadStatus("저장하는 중...");

  try {
    const saved = await uploadToCloudflare([...fileInput.files], folder);
    setUploadStatus(`${saved}개 저장 완료`);
    fileInput.value = "";
    uploadPassword.value = "";
    uploadFolderNew.value = "";
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
    const uploadFile = await watermarkFile(file);
    formData.append("files", uploadFile);
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

async function watermarkFile(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/avif") {
    return file;
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const footerHeight = Math.max(58, Math.round(image.naturalHeight * 0.055));

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight + footerHeight;

  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
  ctx.fillRect(0, image.naturalHeight, canvas.width, footerHeight);

  const fontSize = Math.max(24, Math.round(canvas.width * 0.025));
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Photo by sj_yc12", canvas.width / 2, image.naturalHeight + footerHeight / 2);

  URL.revokeObjectURL(image.src);

  const type = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.92));
  if (!blob) return file;

  const name = file.name.replace(/\.(jpe?g|png|webp)$/i, type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg");
  return new File([blob], name, { type, lastModified: Date.now() });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

async function downloadSelected() {
  if (!selectedPaths.size) {
    setUploadStatus("다운로드할 파일을 선택해 주세요.", true);
    return;
  }

  await manageRequest("/download", {
    paths: [...selectedPaths],
    password: managePassword.value.trim()
  }, "다운로드 준비 완료", async (data) => {
    const files = data.files || [];
    for (const file of files) {
      await downloadFile(file.url, file.name);
    }
  });
}

function selectAllVisible() {
  const items = filteredItems();
  const allSelected = items.length > 0 && items.every(item => selectedPaths.has(item.path));

  if (allSelected) {
    items.forEach(item => selectedPaths.delete(item.path));
  } else {
    items.forEach(item => selectedPaths.add(item.path));
  }

  renderGallery();
  updateManagePanel();
}

async function watermarkSelected() {
  if (!selectedPaths.size) {
    setUploadStatus("워터마크를 넣을 사진을 선택해 주세요.", true);
    return;
  }

  if (!managePassword.value.trim()) {
    setUploadStatus("관리 비밀번호를 입력해 주세요.", true);
    return;
  }

  const items = [...selectedPaths]
    .map(path => allItems.find(item => item.path === path))
    .filter(item => item && IMAGE_EXT.includes(item.ext) && item.ext !== ".gif" && item.ext !== ".avif");

  if (!items.length) {
    setUploadStatus("워터마크를 넣을 수 있는 JPG/PNG/WebP 사진을 선택해 주세요.", true);
    return;
  }

  watermarkBtn.disabled = true;
  setUploadStatus(`워터마크 적용 중 0/${items.length}`);

  try {
    let changed = 0;

    for (const item of items) {
      const res = await fetch(absoluteUrl(item.url), { cache: "no-store" });
      if (!res.ok) throw new Error(`${item.name} 불러오기 실패`);

      const blob = await res.blob();
      const sourceFile = new File([blob], item.name, { type: blob.type || contentTypeForExt(item.ext) });
      const watermarked = await watermarkFile(sourceFile);

      const formData = new FormData();
      formData.append("path", item.path);
      formData.append("password", managePassword.value.trim());
      formData.append("file", watermarked);

      const replaceRes = await fetch(`${CONFIG.apiBase}/replace`, {
        method: "POST",
        body: formData
      });

      const data = await replaceRes.json().catch(() => ({}));
      if (!replaceRes.ok) throw new Error(data.error || `${item.name} 저장 실패`);

      changed += 1;
      setUploadStatus(`워터마크 적용 중 ${changed}/${items.length}`);
    }

    setUploadStatus(`워터마크 적용 완료: ${changed}개`);
    managePassword.value = "";
    await loadPhotos();
  } catch (err) {
    console.error(err);
    setUploadStatus(err.message || "워터마크 적용 실패", true);
  } finally {
    watermarkBtn.disabled = false;
  }
}

async function downloadFile(url, name) {
  const res = await fetch(absoluteUrl(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`${name} 다운로드 실패`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function moveSelected() {
  if (!selectedPaths.size) {
    setUploadStatus("이동할 파일을 선택해 주세요.", true);
    return;
  }

  const folder = getChosenFolder(moveFolderSelect, moveFolderNew);
  if (!folder) {
    setUploadStatus("옮길 폴더를 선택하거나 새 폴더명을 입력해 주세요.", true);
    return;
  }

  await manageRequest("/move", {
    paths: [...selectedPaths],
    folder,
    password: managePassword.value.trim()
  }, "이동 완료");
}

async function deleteSelected() {
  if (!selectedPaths.size) {
    setUploadStatus("삭제할 파일을 선택해 주세요.", true);
    return;
  }
  if (!confirm(`${selectedPaths.size}개 파일을 삭제할까요?`)) return;

  await manageRequest("/delete", {
    paths: [...selectedPaths],
    password: managePassword.value.trim()
  }, "삭제 완료");
}

async function manageRequest(path, body, successText, afterSuccess) {
  if (!body.password) {
    setUploadStatus("관리 비밀번호를 입력해 주세요.", true);
    return;
  }

  try {
    ensureApiBase();
    const res = await fetch(`${CONFIG.apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `작업 실패: ${res.status}`);

    if (afterSuccess) await afterSuccess(data);

    setUploadStatus(data.changed === undefined ? successText : `${successText}: ${data.changed}개`);
    if (path !== "/download") {
      selectedPaths.clear();
      moveFolderNew.value = "";
      await loadPhotos();
      updateManagePanel();
    }
    managePassword.value = "";
  } catch (err) {
    console.error(err);
    setUploadStatus(err.message || "작업 실패", true);
  }
}

async function saveFolderCover(event) {
  event.preventDefault();
  const folder = getChosenFolder(coverFolderSelect, coverFolderNew);
  if (!folder) {
    setUploadStatus("대표사진을 넣을 폴더를 선택하거나 새 폴더명을 입력해 주세요.", true);
    return;
  }
  if (!coverFileInput.files.length) {
    setUploadStatus("대표사진 파일을 선택해 주세요.", true);
    return;
  }
  if (!coverPassword.value.trim()) {
    setUploadStatus("비밀번호를 입력해 주세요.", true);
    return;
  }

  coverBtn.disabled = true;
  setUploadStatus("대표사진 저장 중...");
  try {
    ensureApiBase();
    const formData = new FormData();
    formData.append("folder", folder);
    formData.append("password", coverPassword.value.trim());
    formData.append("file", coverFileInput.files[0]);

    const res = await fetch(`${CONFIG.apiBase}/cover`, {
      method: "POST",
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `대표사진 저장 실패: ${res.status}`);

    setUploadStatus("대표사진 저장 완료");
    coverFileInput.value = "";
    coverPassword.value = "";
    coverFolderNew.value = "";
    await loadPhotos();
  } catch (err) {
    console.error(err);
    setUploadStatus(err.message || "대표사진 저장 실패", true);
  } finally {
    coverBtn.disabled = false;
  }
}

async function loadPhotos() {
  grid.innerHTML = "";
  countText.textContent = "불러오는 중";
  empty.classList.add("hidden");

  try {
    ensureApiBase();
    const res = await fetch(`${CONFIG.apiBase}/items`, { cache: "no-store" });
    if (!res.ok) throw new Error(`목록 불러오기 실패: ${res.status}`);
    const data = await res.json();
    allItems = Array.isArray(data) ? data : data.items || [];
    folderCovers = Array.isArray(data) ? {} : data.covers || {};
    folders = [...new Set([...allItems.map(item => item.folder), ...Object.keys(folderCovers)])]
      .sort((a, b) => a.localeCompare(b, "ko"));
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
  const folderOptions = folders.length ? folders : ["기본"];
  const optionsHtml = folderOptions.map(folder => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`).join("");
  folderSelect.innerHTML = `<option value="">전체</option>` + optionsHtml;
  uploadFolderSelect.innerHTML = optionsHtml + `<option value="${NEW_FOLDER_VALUE}">+ 새 폴더 추가</option>`;
  moveFolderSelect.innerHTML = optionsHtml + `<option value="${NEW_FOLDER_VALUE}">+ 새 폴더 추가</option>`;
  coverFolderSelect.innerHTML = optionsHtml + `<option value="${NEW_FOLDER_VALUE}">+ 새 폴더 추가</option>`;
  syncFolderInputs();
}

function syncFolderInputs() {
  uploadFolderNewWrap.classList.toggle("hidden", uploadFolderSelect.value !== NEW_FOLDER_VALUE);
  moveFolderNew.classList.toggle("hidden", moveFolderSelect.value !== NEW_FOLDER_VALUE);
  coverFolderNew.classList.toggle("hidden", coverFolderSelect.value !== NEW_FOLDER_VALUE);
}

function getChosenFolder(selectEl, inputEl) {
  if (selectEl.value === NEW_FOLDER_VALUE) return inputEl.value.trim();
  return selectEl.value.trim() || "기본";
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
      if (manageMode) {
        toggleSelected(card.dataset.path);
        return;
      }
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
    <article class="card ${selectedPaths.has(item.path) ? "selected" : ""}" data-path="${escapeHtml(item.path)}">
      <span class="select-mark"></span>
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
    const cover = folderCovers[folder] ? absoluteUrl(folderCovers[folder]) : "";
    return `
      <article class="folder-card" data-folder="${escapeHtml(folder)}">
        <span class="${cover ? "has-cover" : ""}" ${cover ? `style="background-image:url('${escapeAttr(cover)}')"` : ""}></span>
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

function toggleManageMode() {
  manageMode = !manageMode;
  selectedPaths.clear();
  manageBtn.textContent = manageMode ? "취소" : "선택";
  managePanel.classList.toggle("hidden", !manageMode);
  renderGallery();
  updateManagePanel();
}

function toggleSelected(path) {
  if (selectedPaths.has(path)) selectedPaths.delete(path);
  else selectedPaths.add(path);
  renderGallery();
  updateManagePanel();
}

function updateManagePanel() {
  selectedCount.textContent = `${selectedPaths.size}개 선택됨`;
}

function openViewer(item) {
  let media = `<iframe src="${absoluteUrl(item.url)}"></iframe>`;
  if (IMAGE_EXT.includes(item.ext)) {
    media = `<img src="${absoluteUrl(item.url)}" alt="">`;
  } else if (VIDEO_EXT.includes(item.ext)) {
    media = `<video src="${absoluteUrl(item.url)}" controls autoplay></video>`;
  }
  viewerBody.innerHTML = `
    <div class="viewer-media">
      ${media}
      <div class="watermark-pattern" aria-hidden="true">
        ${Array.from({ length: 28 }, () => `<span>Photo by sj_yc12</span>`).join("")}
      </div>
    </div>
    <div class="viewer-info">
      <h2>${escapeHtml(cleanName(item.name))}</h2>
      <p>${escapeHtml(item.folder)}</p>
      <a href="${viewUrl(item.path)}" target="_blank" rel="noreferrer">원본 열기</a>
    </div>
  `;
  viewer.showModal();
}

function viewUrl(path) {
  return `${CONFIG.apiBase}/view/${encodeURIComponent(path).replaceAll("%2F", "/")}`;
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

function contentTypeForExt(ext) {
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
  }[ext] || "image/jpeg";
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

function escapeAttr(text = "") {
  return escapeHtml(text).replaceAll("`", "&#096;");
}

loadPhotos();
