"""v63: real headless-Chrome check that taught rules survive losing localStorage (idb.js backup:
OPFS first, IndexedDB fallback) and that a forgotten rule is not resurrected.
Run from the repo root: python3 scripts/browser-idb-restore.py   (needs playwright + chrome)."""
import asyncio, os, subprocess, sys, time
from playwright.async_api import async_playwright

PORT = 8799
KEY = "nova-rules-v1"
READ_BACKUP = """async () => {
  const out = { opfs: null, idb: null };
  try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('nova-brain');
        out.opfs = await (await (await d.getFileHandle('%s.json')).getFile()).text(); } catch (e) {}
  try { out.idb = await new Promise((res) => { const r = indexedDB.open('nova-idb-v1', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get('%s');
          g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); } catch (e) { res(null); } };
        r.onerror = () => res(null); }); } catch (e) {}
  return out; }""" % (KEY, KEY)

async def say(pg, line):
    box = pg.locator("textarea").first
    await box.fill(line); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(400)
    return await pg.evaluate("[...document.querySelectorAll('.bubble')].pop().textContent")

def froms(raw):
    import json
    return [r["from"] for r in json.loads(raw or '{"rules":[]}')["rules"]]

async def wait_backup(pg, want):
    for _ in range(60):
        b = await pg.evaluate(READ_BACKUP)
        raw = b["opfs"] or b["idb"]
        if raw is not None and froms(raw) == want: return b
        await pg.wait_for_timeout(250)
    raise AssertionError("backup never matched %r: %r" % (want, b))

async def run_mode(b, mode):
    print("== mode:", mode)
    c = await b.new_context(); errs = []
    if mode == "IndexedDB":  # hide OPFS so idb.js takes its IndexedDB fallback
        await c.add_init_script("try { Object.defineProperty(StorageManager.prototype, 'getDirectory', { value: undefined }); } catch (e) {}")
    pg = await c.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto("http://localhost:%d/" % PORT); await pg.wait_for_timeout(1500)
    print("1", await say(pg, "rain makes you wet"))
    print("2", await say(pg, "an umbrella keeps you dry"))
    bk = await wait_backup(pg, ["rain", "umbrella"])
    where = "OPFS" if bk["opfs"] else "IndexedDB"
    print("backup store:", where); assert where == mode, where
    await pg.evaluate("localStorage.removeItem('%s')" % KEY)
    await pg.reload(); await pg.wait_for_timeout(1500)
    got = froms(await pg.evaluate("localStorage.getItem('%s')" % KEY))
    assert got == ["rain", "umbrella"], got
    print("3 restored after key removal + reload:", got)
    print("4", await say(pg, "should I bring an umbrella if it rains?"))
    print("5", await say(pg, "forget that rule"))
    await wait_backup(pg, ["rain"])
    await pg.reload(); await pg.wait_for_timeout(1500)
    got = froms(await pg.evaluate("localStorage.getItem('%s')" % KEY))
    assert got == ["rain"], got
    await pg.evaluate("localStorage.removeItem('%s')" % KEY)
    await pg.reload(); await pg.wait_for_timeout(1500)
    got = froms(await pg.evaluate("localStorage.getItem('%s')" % KEY))
    assert got == ["rain"], got
    print("6 after forget: reload and key-removal+reload both give", got, "(no resurrection)")
    assert not errs, errs
    await c.close()

async def main():
    web = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=web, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1); ok = False
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
            for mode in ("OPFS", "IndexedDB"):
                await run_mode(b, mode)
            await b.close()
            ok = True
    finally:
        srv.terminate()
    print("BROWSER IDB RESTORE: PASS" if ok else "BROWSER IDB RESTORE: FAIL")
    sys.exit(0 if ok else 1)

asyncio.run(main())
