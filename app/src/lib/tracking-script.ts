export const trackingScript = `(() => {
  const s = document.currentScript;
  if (!s || !s.src) return;
  const domain = s && s.getAttribute("data-domain");
  let endpoint;
  try { endpoint = new URL(s.getAttribute("data-api") || "/api/event", s.src).href; } catch (e) { return; }
  const installed = window.__litestatsTrackers || (window.__litestatsTrackers = Object.create(null));
  const trackerKey = JSON.stringify([endpoint, domain]);
  if (installed[trackerKey]) return;
  installed[trackerKey] = true;
  const trackOutbound = !s || s.getAttribute("data-outbound") !== "false";
  const trackFiles = !s || s.getAttribute("data-file-downloads") !== "false";
  let pageKey = "";
  const entryReferrer = document.referrer;
  function beacon(body) {
    try { if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain;charset=UTF-8" })); } catch (e) {}
  }
  function deliver(body, attempt) {
    if (typeof fetch !== "function") { beacon(body); return; }
    try {
      fetch(endpoint, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=UTF-8" }, credentials: "omit", keepalive: true }).then(function (response) {
        // Only this explicit rejection guarantees that the event was not queued.
        // Network failures, generic 5xx responses and queued Beacons are ambiguous.
        if (response.status !== 503 || attempt >= 2) return;
        return response.json().then(function (result) {
          if (result && result.error === "event_buffer_full") window.setTimeout(function () { deliver(body, attempt + 1); }, (attempt + 1) * 1000);
        });
      }).catch(function () {});
    } catch (e) { beacon(body); }
  }
  function send(payload) {
    if (document.prerendering) return;
    try {
      const body = JSON.stringify(Object.assign({
        n: "pageview", d: domain, u: location.href, r: entryReferrer, w: innerWidth,
        t: document.title || "", l: navigator.language || "",
        s: (screen.width && screen.height) ? (screen.width + "x" + screen.height) : ""
      }, payload || {}));
      deliver(body, 0);
    } catch (e) {}
  }
  function pageview(force) {
    if (document.prerendering) return;
    const url = location.href;
    const key = url.split("#")[0];
    if (!force && key === pageKey) return;
    pageKey = key;
    send({ u: url });
  }
  function start() {
    pageview();
    if (document.documentElement && /404|not found/i.test(document.title)) send({ n: "404", p: { path: location.pathname } });
  }
  if (document.prerendering) document.addEventListener("prerenderingchange", start, { once: true });
  else start();
  ["pushState", "replaceState"].forEach(function (name) {
    const original = history[name];
    history[name] = function () { const result = original.apply(this, arguments); pageview(); return result; };
  });
  window.addEventListener("popstate", function () { pageview(); });
  window.addEventListener("pageshow", function (ev) { if (ev.persisted) pageview(true); });
  document.addEventListener("click", function (ev) {
    const a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
    if (!a || !a.href) return;
    let url;
    try { url = new URL(a.href); } catch (e) { return; }
    if (trackOutbound && url.host && url.host !== location.host) send({ n: "Outbound Link: Click", p: { url: url.href } });
    if (trackFiles && /\\.(pdf|zip|csv|docx?|xlsx?|pptx?|rar|7z|mp4|mp3)(\\?|#|$)/i.test(url.pathname)) send({ n: "File Download", p: { url: url.href } });
  }, true);
  window.litestats = { track: function (name, props) { send({ n: name, p: props || {} }); } };
})();`
