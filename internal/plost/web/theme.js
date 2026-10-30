(() => {
  try {
    const theme = localStorage.getItem('plost:theme') || 'system';
    document.documentElement.dataset.theme = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    document.documentElement.dataset.accent = localStorage.getItem('litestats:accent') || localStorage.getItem('plost:accent') || 'purple';
    document.documentElement.dataset.siteLayout = localStorage.getItem('litestats:site-layout') === 'grid' ? 'grid' : 'compact';
    document.documentElement.lang = localStorage.getItem('plost:locale') === 'en' ? 'en' : 'zh-CN';
  } catch (_) {}
})();
