// Clicking the toolbar icon opens the full report next to the current tab.
// If the current tab is a regular web page, its id is passed along so the
// report can collect the fingerprint *from inside that page* (activeTab grant).
chrome.action.onClicked.addListener((tab) => {
  const url = new URL(chrome.runtime.getURL('report.html'));
  if (tab && tab.id !== undefined && /^(https?|file):/.test(tab.url || '')) {
    url.searchParams.set('tab', String(tab.id));
    url.searchParams.set('origin', new URL(tab.url).origin);
  }
  chrome.tabs.create({ url: url.toString(), index: tab ? tab.index + 1 : undefined });
});
