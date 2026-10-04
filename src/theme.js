// Apply the saved theme before styles load, avoiding a bright flash on startup.
(() => {
  let saved;
  try {
    // Remove the unused pedal cache left by older releases.
    localStorage.removeItem('tonex-last-read');
    saved = localStorage.getItem('tonex-theme');
  } catch {}
  const theme =
    saved === 'light' || saved === 'dark'
      ? saved
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = theme;
})();
