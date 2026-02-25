// ─────────────────────────────────────────────────
//  TabStash – popup.js
// ─────────────────────────────────────────────────

const STORAGE_KEY = 'tabstash_urls';

// DOM refs
const urlList = document.getElementById('urlList');
const emptyState = document.getElementById('emptyState');
const listHeader = document.getElementById('listHeader');
const tabCount = document.getElementById('tabCount');
const urlInput = document.getElementById('urlInput');
const addUrlBtn = document.getElementById('addUrlBtn');
const addCurrentBtn = document.getElementById('addCurrentTab');
const addAllBtn = document.getElementById('addAllTab');
const openAllBtn = document.getElementById('openAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const toast = document.getElementById('toast');

let savedTabs = [];    // Array of { id, url, title, favicon }
let toastTimer = null;

// ─── STORAGE ──────────────────────────────────────

async function load() {
  return new Promise(resolve => {
    chrome.storage.local.get([STORAGE_KEY], result => {
      savedTabs = result[STORAGE_KEY] || [];
      resolve(savedTabs);
    });
  });
}

async function save() {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: savedTabs }, resolve);
  });
}

// ─── RENDER ───────────────────────────────────────

function render() {
  // Update count badge
  tabCount.textContent = `${savedTabs.length} saved`;

  // Show/hide list header
  listHeader.style.display = savedTabs.length > 0 ? 'flex' : 'none';

  // Clear existing items (keep emptyState)
  const items = urlList.querySelectorAll('.url-item');
  items.forEach(el => el.remove());

  if (savedTabs.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  savedTabs.forEach(tab => {
    const item = createItem(tab);
    urlList.appendChild(item);
  });
}

function createItem(tab) {
  const el = document.createElement('div');
  el.className = 'url-item';
  el.dataset.id = tab.id;

  const hostname = getHostname(tab.url);
  const faviconUrl = tab.favicon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  const displayTitle = tab.title || hostname || tab.url;

  el.innerHTML = `
    <img class="item-favicon" src="${faviconUrl}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 16 16\\'><rect width=\\'16\\' height=\\'16\\' rx=\\'3\\' fill=\\'%23333\\'/></svg>'">
    <div class="item-info">
      <div class="item-title" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
      <div class="item-url" title="${escapeHtml(tab.url)}">${escapeHtml(tab.url)}</div>
    </div>
    <div class="item-actions">
      <button class="btn-open-single" title="Open this tab">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 10L10 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="btn-remove" title="Remove">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;

  // Open single tab
  el.querySelector('.btn-open-single').addEventListener('click', e => {
    e.stopPropagation();
    chrome.tabs.create({ url: tab.url, active: false });
    showToast('Opened in new tab', 'success');
  });

  // Click on info → open tab
  el.querySelector('.item-info').addEventListener('click', () => {
    chrome.tabs.create({ url: tab.url, active: true });
    showToast('Opened in new tab', 'success');
  });

  // Remove
  el.querySelector('.btn-remove').addEventListener('click', e => {
    e.stopPropagation();
    removeTab(tab.id);
  });

  return el;
}

// ─── ACTIONS ──────────────────────────────────────

async function addTab(url, title = '', favicon = '', id = '') {
  url = normalizeUrl(url);
  if (!isValidUrl(url)) {
    showToast('Invalid URL', 'error');
    return;
  }

  // Prevent duplicates
  if (savedTabs.find(t => t.url === url)) {
    showToast('URL already saved!', 'error');
    return;
  }

  const newTab = {
    id: id || Date.now().toString(),
    url,
    title: title || getHostname(url),
    favicon
  };

  savedTabs.push(newTab);
  await save();
  render();
  showToast('Tab saved!', 'success');
}

async function removeTab(id) {
  const el = urlList.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.style.animation = 'none';
    el.style.transition = 'opacity 0.15s, transform 0.15s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(8px)';
    await wait(150);
  }

  savedTabs = savedTabs.filter(t => t.id !== id);
  await save();
  render();
  showToast('Removed', 'success');
}

async function openAllTabs() {
  if (savedTabs.length === 0) return;

  for (const tab of savedTabs) {
    chrome.tabs.create({ url: tab.url, active: false });
    await wait(80); // slight stagger to avoid browser choking
  }

  showToast(`Opened ${savedTabs.length} tab${savedTabs.length > 1 ? 's' : ''}!`, 'success');
}

async function clearAll() {
  if (savedTabs.length === 0) return;
  const count = savedTabs.length;
  savedTabs = [];
  await save();
  render();
  showToast(`Cleared ${count} tab${count > 1 ? 's' : ''}`, 'success');
}

// ─── EVENT LISTENERS ──────────────────────────────

addCurrentBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    await addTab(tab.url, tab.title, tab.favIconUrl || '', tab.id);
  }
});
addAllBtn.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({});
  console.log(tabs)
  tabs.forEach(async (tab) => {
    if (tab && tab.url) {
      await addTab(tab.url, tab.title, tab.favIconUrl || '', tab.id);
    }
  })

});

addUrlBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (url) {
    await addTab(url);
    urlInput.value = '';
  }
});

urlInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const url = urlInput.value.trim();
    if (url) {
      await addTab(url);
      urlInput.value = '';
    }
  }
});

openAllBtn.addEventListener('click', openAllTabs);

clearAllBtn.addEventListener('click', async () => {
  if (savedTabs.length === 0) return;
  const confirmed = confirm(`Remove all ${savedTabs.length} saved tabs?`);
  if (confirmed) clearAll();
});

// ─── UTILS ────────────────────────────────────────

function getHostname(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function normalizeUrl(url) {
  url = url.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let toastTimeout = null;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = `toast${type ? ' ' + type : ''} visible`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
}

// ─── INIT ─────────────────────────────────────────

(async () => {
  await load();
  render();
})();
