// Before anything is drawn: the panel's theme (dark unless chosen otherwise), so the page never flashes the wrong one.
try { document.documentElement.dataset.theme = localStorage.getItem('mzadm.theme') || 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }
