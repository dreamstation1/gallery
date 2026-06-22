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

      if (request.method === "POST" && url.pathname === "/upload") return cors(await upload(request, env));
      if (request.method === "POST" && url.pathname === "/cover") return cors(await uploadCover(request, env));
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

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
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
