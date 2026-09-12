import { createFileRoute } from "@tanstack/react-router"

const script = `(() => {
  const s = document.currentScript;
  const domain = s && s.getAttribute("data-domain");
  const endpoint = (s && s.getAttribute("data-api")) || "/api/event";
  const trackOutbound = !s || s.getAttribute("data-outbound") !== "false";
  const trackFiles = !s || s.getAttribute("data-file-downloads") !== "false";
  function send(payload) {
    try {
      const body = JSON.stringify(Object.assign({
        n: "pageview", d: domain, u: location.href, r: document.referrer, w: innerWidth,
        t: document.title || "", l: navigator.language || "",
        s: (screen.width && screen.height) ? (screen.width + "x" + screen.height) : ""
      }, payload || {}));
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      else fetch(endpoint, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
    } catch (e) {}
  }
  send();
  const push = history.pushState;
  history.pushState = function () { push.apply(this, arguments); send(); };
  window.addEventListener("popstate", function () { send(); });
  document.addEventListener("click", function (ev) {
    const a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
    if (!a || !a.href) return;
    let url;
    try { url = new URL(a.href); } catch (e) { return; }
    if (trackOutbound && url.host && url.host !== location.host) send({ n: "Outbound Link: Click", p: { url: url.href } });
    if (trackFiles && /\\.(pdf|zip|csv|docx?|xlsx?|pptx?|rar|7z|mp4|mp3)(\\?|#|$)/i.test(url.pathname)) send({ n: "File Download", p: { url: url.href } });
  }, true);
  if (document.documentElement && /404|not found/i.test(document.title)) send({ n: "404", p: { path: location.pathname } });
  window.litestats = { track: function (name, props) { send({ n: name, p: props || {} }); } };
})();`

export const Route = createFileRoute("/js/script.js")({
  server: {
    handlers: {
      GET: async () => new Response(script, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      }),
    },
  },
})
