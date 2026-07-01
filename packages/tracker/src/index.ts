(function () {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;

  const trackingId = script.getAttribute("data-tracking-id");
  const endpoint = script.getAttribute("data-endpoint") || "/api/collect";
  if (!trackingId) return;

  function send(payload: Record<string, unknown>) {
    const body = JSON.stringify({ ...payload, trackingId });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
      return;
    }
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  function trackPageview() {
    send({
      type: "pageview",
      url: location.href,
      path: location.pathname + location.search,
      referrer: document.referrer || null,
    });
  }

  window.litestats = {
    track(eventName: string, data?: Record<string, unknown>) {
      send({
        type: "event",
        eventName,
        url: location.href,
        path: location.pathname + location.search,
        referrer: document.referrer || null,
        data: data ?? null,
      });
    },
  };

  trackPageview();

  const pushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    pushState(...args);
    trackPageview();
  };

  const replaceState = history.replaceState.bind(history);
  history.replaceState = function (...args) {
    replaceState(...args);
    trackPageview();
  };

  window.addEventListener("popstate", trackPageview);
})();
