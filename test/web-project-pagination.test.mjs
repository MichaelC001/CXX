import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const webSource = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");

function projectLoaderSource() {
  const start = webSource.indexOf("async function ensureProjectLoaded(");
  const end = webSource.indexOf("// 时间线模式翻页", start);
  assert.ok(start >= 0 && end > start, "project loader source should be present");
  return webSource.slice(start, end);
}

test("项目展开只请求一页并保留下一页游标", async () => {
  const calls = [];
  const app = {
    projSessions: new Map(),
    view: "list",
    listGen: 0,
    session: {
      request: async (method, params) => {
        calls.push({ method, params });
        return {
          sessions: Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, updatedAt: i })),
          nextCursor: "page-2",
        };
      },
    },
  };
  const sandbox = {
    app,
    renderList() {},
    ingestSessions() {},
  };
  vm.runInNewContext(`${projectLoaderSource()}\nglobalThis.loader = ensureProjectLoaded;`, sandbox);

  await sandbox.loader("/Users/fou/dev/openrouter", "/Users/fou/dev/openrouter");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "sessions.list");
  assert.equal(calls[0].params.cwd, "/Users/fou/dev/openrouter");
  assert.equal(calls[0].params.cursor, null);
  assert.equal(calls[0].params.limit, 100);
  const cache = app.projSessions.get("/Users/fou/dev/openrouter");
  assert.equal(cache.sessions.length, 100);
  assert.equal(cache.nextCursor, "page-2");
  assert.equal(cache.done, false);
  assert.equal(cache.loading, false);
});

test("首页不再后台预取全部项目会话", () => {
  assert.doesNotMatch(webSource, /prefetchAllProjects|prefetching|prefetchAt/);
});

test("中继和直连 RPC 默认超时统一为 30 秒", () => {
  assert.match(webSource, /const REQUEST_TIMEOUT_MS = 30000;/);
  assert.equal((webSource.match(/timeoutMs = REQUEST_TIMEOUT_MS/g) || []).length, 3);
  assert.doesNotMatch(webSource, /timeoutMs = 15000/);
});
