const PASSWORD_HASH = "8797d0ddf0f02784b207fe18c89ac3bbc801b037c0d6f0e03a8051772d623c54";
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const ALLOWED_EXT = new Set([...IMAGE_EXT, ".mp4", ".webm", ".mov", ".pdf"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    try {
      if (request.method === "GET" && url.pathname === "/items") {
        const { items, covers } = await listLibrary(env);
        return cors(json({ items, covers }));
      }

      if (request.method === "GET" && url.pathname.startsWith("/file/")) {
        const key = decodeURIComponent(url.pathname.slice("/file/".length));
        const object = await env.GALLERY_BUCKET.get(key);
        if (!object) return cors(json({ error: "Not found" }, 404));
        return cors(new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType || contentType(extension(key)),
            "Cache-Control": "public, max-age=31536000"
          }
        }));
      }

      if (request.method === "GET" && url.pathname.startsWith("/view/")) {
        const key = decodeURIComponent(url.pathname.slice("/view/".length));
        const object = await env.GALLERY_BUCKET.head(key);
        if (!object || !safePhotoKey(key)) return cors(html("Not found", 404));
        return cors(html(viewPage(key)));
      }

      if (request.method === "POST" && url.pathname === "/upload") return cors(await upload(request, env));
      if (request.method === "POST" && url.pathname === "/cover") return cors(await uploadCover(request, env));
      if (request.method === "POST" && url.pathname === "/replace") return cors(await replaceObject(request, env));
      if (request.method === "POST" && url.pathname === "/download") return cors(await downloadObjects(request, env));
      if (request.method === "POST" && url.pathname === "/move") return cors(await moveObjects(request, env));
      if (request.method === "POST" && url.pathname === "/delete") return cors(await deleteObjects(request, env));

      return cors(json({ error: "Not found" }, 404));
    } catch (err) {
      return cors(json({ error: err.message || "Server error" }, 500));
    }
  }
};

async function upload(request, env) {
  const form = await request.formData();
  const passwordError = await assertPassword(form.get("password"));
  if (passwordError) return passwordError;

  const folder = safeFolder(String(form.get("folder") || "기본"));
  const files = form.getAll("files").filter(value => value instanceof File);
  let saved = 0;

  for (const file of files) {
    const ext = extension(file.name);
    if (!ALLOWED_EXT.has(ext)) continue;
    const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
    const key = `photos/${folder}/${stamp}_${safeName(file.name)}`;
    await env.GALLERY_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || contentType(ext) }
    });
    saved += 1;
  }

  if (!saved) return json({ error: "저장 가능한 파일이 없습니다." }, 400);
  return json({ saved });
}

async function uploadCover(request, env) {
  const form = await request.formData();
  const passwordError = await assertPassword(form.get("password"));
  if (passwordError) return passwordError;

  const folder = safeFolder(String(form.get("folder") || "기본"));
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "대표사진 파일을 선택해 주세요." }, 400);

  const ext = extension(file.name);
  if (!IMAGE_EXT.has(ext)) return json({ error: "대표사진은 이미지 파일만 가능합니다." }, 400);

  const prefix = `covers/${folder}/`;
  await deletePrefix(env, prefix);
  const key = `${prefix}cover${ext}`;
  await env.GALLERY_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || contentType(ext) }
  });

  return json({ folder, cover: `/file/${encodeURIComponent(key).replaceAll("%2F", "/")}` });
}

async function replaceObject(request, env) {
  const form = await request.formData();
  const passwordError = await assertPassword(form.get("password"));
  if (passwordError) return passwordError;

  const key = safePhotoKey(form.get("path"));
  if (!key) return json({ error: "잘못된 파일 경로입니다." }, 400);

  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "저장할 파일을 선택해 주세요." }, 400);

  const ext = extension(key);
  if (!IMAGE_EXT.has(ext) || ext === ".gif" || ext === ".avif") {
    return json({ error: "JPG, PNG, WebP 사진만 워터마크를 적용할 수 있습니다." }, 400);
  }

  await env.GALLERY_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || contentType(ext) }
  });

  return json({ changed: 1 });
}

async function moveObjects(request, env) {
  const body = await request.json();
  const passwordError = await assertPassword(body.password);
  if (passwordError) return passwordError;

  const folder = safeFolder(String(body.folder || "기본"));
  const paths = Array.isArray(body.paths) ? body.paths : [];
  let changed = 0;

  for (const path of paths) {
    const sourceKey = safePhotoKey(path);
    if (!sourceKey) continue;
    const object = await env.GALLERY_BUCKET.get(sourceKey);
    if (!object) continue;

    const name = sourceKey.split("/").pop();
    const targetKey = `photos/${folder}/${name}`;
    if (targetKey === sourceKey) continue;

    await env.GALLERY_BUCKET.put(targetKey, object.body, { httpMetadata: object.httpMetadata });
    await env.GALLERY_BUCKET.delete(sourceKey);
    changed += 1;
  }

  return json({ changed });
}

async function downloadObjects(request, env) {
  const body = await request.json();
  const passwordError = await assertPassword(body.password);
  if (passwordError) return passwordError;

  const paths = Array.isArray(body.paths) ? body.paths : [];
  const files = [];

  for (const path of paths) {
    const key = safePhotoKey(path);
    if (!key) continue;

    const object = await env.GALLERY_BUCKET.head(key);
    if (!object) continue;

    files.push({
      name: key.split("/").pop(),
      path: key,
      url: fileUrl(key)
    });
  }

  return json({ files });
}

async function deleteObjects(request, env) {
  const body = await request.json();
  const passwordError = await assertPassword(body.password);
  if (passwordError) return passwordError;

  const paths = Array.isArray(body.paths) ? body.paths : [];
  let changed = 0;

  for (const path of paths) {
    const key = safePhotoKey(path);
    if (!key) continue;
    await env.GALLERY_BUCKET.delete(key);
    changed += 1;
  }

  return json({ changed });
}

async function listLibrary(env) {
  const items = [];
  const covers = {};
  await listPrefix(env, "photos/", object => {
    const key = object.key;
    const name = key.split("/").pop();
    const relative = key.replace(/^photos\//, "");
    const parts = relative.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "기본";
    const ext = extension(name);
    if (!ALLOWED_EXT.has(ext)) return;
    items.push({ name, path: key, folder, url: fileUrl(key), ext });
  });

  await listPrefix(env, "covers/", object => {
    const key = object.key;
    const relative = key.replace(/^covers\//, "");
    const parts = relative.split("/");
    if (parts.length < 2) return;
    const folder = parts.slice(0, -1).join("/");
    covers[folder] = fileUrl(key);
  });

  return {
    items: items.sort((a, b) => a.name.localeCompare(b.name, "ko")),
    covers
  };
}

async function listPrefix(env, prefix, onObject) {
  let cursor;
  do {
    const page = await env.GALLERY_BUCKET.list({ prefix, cursor });
    cursor = page.truncated ? page.cursor : undefined;
    for (const object of page.objects) onObject(object);
  } while (cursor);
}

async function deletePrefix(env, prefix) {
  const keys = [];
  await listPrefix(env, prefix, object => keys.push(object.key));
  await Promise.all(keys.map(key => env.GALLERY_BUCKET.delete(key)));
}

async function assertPassword(password) {
  if (await sha256(String(password || "")) !== PASSWORD_HASH) {
    return json({ error: "비밀번호가 틀렸습니다." }, 401);
  }
  return null;
}

function fileUrl(key) {
  return `/file/${encodeURIComponent(key).replaceAll("%2F", "/")}`;
}

function viewPage(key) {
  const file = fileUrl(key);
  const ext = extension(key);
  const title = escapeHtml(key.split("/").pop() || "photo");
  const media = IMAGE_EXT.has(ext)
    ? `<img src="${file}" alt="">`
    : ext === ".mp4" || ext === ".webm" || ext === ".mov"
      ? `<video src="${file}" controls autoplay></video>`
      : `<iframe src="${file}"></iframe>`;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #05070c; color: white; font-family: system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: 1fr auto; }
    .stage { position: relative; min-height: 0; display: grid; place-items: center; overflow: hidden; background: #02040a; }
    img, video { max-width: 100vw; max-height: calc(100vh - 58px); display: block; }
    iframe { width: 100vw; height: calc(100vh - 58px); border: 0; background: white; }
    .watermark-pattern {
      position: absolute;
      inset: -18%;
      z-index: 2;
      display: grid;
      grid-template-columns: repeat(4, minmax(150px, 1fr));
      gap: 46px 34px;
      align-content: center;
      transform: rotate(-28deg);
      opacity: .82;
      pointer-events: none;
    }
    .watermark-pattern span {
      color: rgba(245, 248, 255, .30);
      font-size: 18px;
      font-weight: 900;
      text-align: center;
      text-shadow: 0 1px 3px rgba(0,0,0,.75), 0 0 1px rgba(0,0,0,.9);
      white-space: nowrap;
    }
    footer { min-height: 58px; display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #080d17; border-top: 1px solid rgba(255,255,255,.12); }
    a { color: #9ec1ff; }
    p { margin: 0; color: rgba(255,255,255,.74); overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <div class="stage">
      ${media}
      <div class="watermark-pattern" aria-hidden="true">
        ${Array.from({ length: 32 }, () => "<span>Photo by sj_yc12</span>").join("")}
      </div>
    </div>
    <footer>
      <p>${title}</p>
    </footer>
  </main>
</body>
</html>`;
}

function html(value, status = 200) {
  return new Response(value, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function safeFolder(value) {
  return value.split(/[\\/]+/).map(part => safeName(part).replace(/\.[^/.]+$/, "")).filter(Boolean).join("/") || "기본";
}

function safeName(value) {
  return String(value || "file").replace(/[<>:"\\|?*\u0000-\u001f]/g, "_").replace(/^\.+|\.+$/g, "").trim() || "file";
}

function safePhotoKey(value) {
  const key = String(value || "");
  if (!key.startsWith("photos/") || key.includes("..")) return "";
  return key;
}

function extension(name) {
  const lower = String(name || "").toLowerCase();
  const index = lower.lastIndexOf(".");
  return index >= 0 ? lower.slice(index) : "";
}

function contentType(ext) {
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".pdf": "application/pdf"
  }[ext] || "application/octet-stream";
}
