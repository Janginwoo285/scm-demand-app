// 저장소: Upstash Redis(무료) 환경변수가 있으면 Redis에, 없으면 Vercel Blob(비공개)에 JSON으로 저장한다.
// - Redis: Vercel Marketplace의 Upstash Redis 연결 시 KV_REST_API_URL/KV_REST_API_TOKEN
//          (또는 UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN)이 자동으로 생긴다. 패키지 설치 불필요(REST 호출).
// - 로컬 점검 때는 LOCAL_STORE_DIR 환경변수가 있으면 디스크 폴더를 대신 쓴다.
import { promises as fs } from "node:fs";
import path from "node:path";

const LOCAL = process.env.LOCAL_STORE_DIR;
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let pgPromise;
async function pgClient() {
  if (!pgPromise) pgPromise = import("@neondatabase/serverless").then(m => m.neon(DATABASE_URL));
  return pgPromise;
}
async function pgGet(p) {
  const sql = await pgClient();
  const rows = await sql`SELECT payload FROM scm_state WHERE key = ${PREFIX + p}`;
  if (!rows.length) return null;
  return { txt: JSON.stringify(rows[0].payload) };
}
async function pgPut(p, txt) {
  const sql = await pgClient();
  await sql`INSERT INTO scm_state(key, payload, updated_at)
            VALUES (${PREFIX + p}, ${JSON.parse(txt)}, now())
            ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
}
const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PREFIX = "scm:";
export const STORE_KIND = LOCAL ? "local" : DATABASE_URL ? "postgres-neon" : R_URL && R_TOKEN ? "upstash-redis" : "vercel-blob";

async function redis(cmd) {
  const r = await fetch(R_URL, { method: "POST", headers: { Authorization: `Bearer ${R_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(cmd) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error("Redis 저장소 오류: " + (d.error || r.status));
  return d.result;
}

let blobMod = null;
async function blob() {
  if (!blobMod) blobMod = await import("@vercel/blob");
  return blobMod;
}
const notFound = e => e && (e.name === "BlobNotFoundError" || /not\s*found/i.test(e.message || ""));

async function readRaw(p) {
  if (LOCAL) {
    try { return { txt: await fs.readFile(path.join(LOCAL, p), "utf8") }; } catch { return null; }
  }
  if (STORE_KIND === "postgres-neon") return pgGet(p);
  if (STORE_KIND === "upstash-redis") {
    const v = await redis(["GET", PREFIX + p]);
    return v == null ? null : { txt: v };
  }
  const { get } = await blob();
  try {
    const r = await get(p, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return { txt: await new Response(r.stream).text(), etag: r.blob && r.blob.etag };
  } catch (e) {
    if (notFound(e)) return null;
    if (/403/.test(e.message || "")) throw new Error("저장소 사용 한도를 넘어 서버 저장소가 일시 정지됐어요 (Vercel Blob 403)");
    throw e;
  }
}

async function writeRaw(p, txt) {
  if (LOCAL) {
    const f = path.join(LOCAL, p);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, txt);
    return;
  }
  if (STORE_KIND === "postgres-neon") { await pgPut(p, txt); return; }
  if (STORE_KIND === "upstash-redis") { await redis(["SET", PREFIX + p, txt]); return; }
  const { put } = await blob();
  await put(p, txt, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
}

export async function read(p, fallback) {
  const r = await readRaw(p);
  if (!r) return { data: fallback(), etag: null };
  return { data: JSON.parse(r.txt), etag: r.etag || null };
}

// 읽고-고치고-쓰기 (수업용 규모라 마지막 저장 우선으로 충분)
export async function update(p, fallback, fn) {
  const { data } = await read(p, fallback);
  const out = await fn(data);
  await writeRaw(p, JSON.stringify(data));
  return out;
}

// 파일(키) 삭제
export async function remove(p) {
  if (LOCAL) { await fs.rm(path.join(LOCAL, p), { force: true }); return; }
  if (STORE_KIND === "postgres-neon") { const sql = await pgClient(); await sql`DELETE FROM scm_state WHERE key = ${PREFIX + p}`; return; }
  if (STORE_KIND === "upstash-redis") { await redis(["DEL", PREFIX + p]); return; }
  const { del } = await blob(); await del(p);
}
