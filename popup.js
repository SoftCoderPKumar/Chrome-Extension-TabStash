// ─────────────────────────────────────────────────
//  TabStash – popup.js
// ─────────────────────────────────────────────────

const URL_STORAGE_KEY = 'tabstash_urls';
const FOLDER_STORAGE_KEY = 'tabstash_folders'

// DOM refs
const urlList = document.getElementById('urlList');
const emptyState = document.getElementById('emptyState');
const listHeader = document.getElementById('listHeader');
const tabCount = document.getElementById('tabCount');
const folderCount = document.getElementById('folderCount');
const folderInput = document.getElementById('folderInput');
const addFolderBtn = document.getElementById('addFolderBtn');
const urlInput = document.getElementById('urlInput');
const addUrlBtn = document.getElementById('addUrlBtn');
const addCurrentBtn = document.getElementById('addCurrentTab');
const addAllBtn = document.getElementById('addAllTab');
const openAllBtn = document.getElementById('openAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const toast = document.getElementById('toast');
const selected = document.getElementById("selected");
const dropdown = document.getElementById("dropdown");
const btnRemoveFolder = document.getElementById("btnRemoveFolder")

let savedTabs = [];    // Array of { id, url, title, favicon }
let savedFolder = [];
let toastTimer = null;
let selectedFolderValue = null;
let selectedFolderSavedTabs = []

// ─── STORAGE ──────────────────────────────────────

async function load() {
  return new Promise(resolve => {
    chrome.storage.local.get([URL_STORAGE_KEY, FOLDER_STORAGE_KEY], result => {
      savedTabs = result[URL_STORAGE_KEY] || [];
      savedFolder = result[FOLDER_STORAGE_KEY] || [];
      resolve({ savedTabs, savedFolder });
    });
  });
}

async function save() {
  return new Promise(resolve => {
    savedFolder.sort((a, b) => a.title.localeCompare(b.title));
    chrome.storage.local.set({ [URL_STORAGE_KEY]: savedTabs, [FOLDER_STORAGE_KEY]: savedFolder }, resolve);
  });
}

// ─── RENDER ───────────────────────────────────────

function render() {
  // Update count badge
  selectedFolderSavedTabs = savedTabs.filter(tab => tab.folderId == selectedFolderValue)
  tabCount.textContent = `${selectedFolderSavedTabs.length} url`;
  folderCount.textContent = `${savedFolder.length} folder`;

  // Show/hide list header
  listHeader.style.display = selectedFolderSavedTabs.length > 0 || savedFolder.length > 0 ? 'flex' : 'none';

  // Clear existing items (keep emptyState)
  const items = urlList.querySelectorAll('.url-item');
  items.forEach(el => el.remove());

  if (selectedFolderSavedTabs.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  selectedFolderSavedTabs.forEach(tab => {
    const item = createItem(tab);
    urlList.appendChild(item);
  });
}

async function renderOptions(newFolder = {}) {
  dropdown.innerHTML = "";

  if (savedFolder.length == 0) {
    const div = document.createElement("div");
    div.textContent = "--No option--";
    selected.textContent = "Select Folder"
    selectedFolderValue = null
    dropdown.appendChild(div);
  } else {
    savedFolder.forEach((item, index) => {
      const div = document.createElement("div");
      div.textContent = item.name;

      div.onclick = () => {
        selectedFolderValue = item.id;

        selected.textContent = (item.name.length > 30) ? item.name.substring(0, 30) + "..." : item.name;

        dropdown.style.display = "none";
        render();
      };

      dropdown.appendChild(div);
    });
  }

  // ✅ Auto select first item
  if (savedFolder.length > 0) {
    selectedFolderValue = newFolder.id || savedFolder[0].id;
    let tempTextContent = newFolder.name || savedFolder[0].name
    selected.textContent = (tempTextContent.length > 30) ? tempTextContent.substring(0, 30) + "..." : tempTextContent;
  }

  btnRemoveFolder.style.display = selectedFolderValue ? "block" : "none"
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

async function addFolder(folderName) {

  // Prevent duplicates
  if (savedFolder.find(t => t.title === folderName)) {
    showToast('Folder already Exist!', 'error');
    return;
  }

  const newFolder = {
    id: Date.now().toString(),
    title: folderName.toLowerCase(),
    name: capitalizeEveryWord(folderName)
  };

  savedFolder.push(newFolder);
  await save();
  await renderOptions(newFolder);
  render();
  showToast('Folder saved!', 'success');
}

async function addTab(url, title = '', favicon = '', id = '') {
  url = normalizeUrl(url);
  if (!isValidUrl(url)) {
    showToast('Invalid URL', 'error');
    return;
  }

  if (!selectedFolderValue) {
    showToast('select folder', 'error');
    return;
  }

  // Prevent duplicates
  if (savedTabs.find(t => t.url === url && t.folderId == selectedFolderValue)) {
    showToast('URL already saved!', 'error');
    return;
  }

  const newTab = {

    id: id || Date.now().toString(),
    url,
    title: title || getHostname(url),
    favicon,
    folderId: selectedFolderValue
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

async function removeFolder(id) {
  savedTabs = savedTabs.filter(tab => tab.folderId != id);
  savedFolder = savedFolder.filter(folder => folder.id != id)
  await save();
  await renderOptions()
  render();
  console.log(savedTabs);
  console.log(savedFolder)
  showToast('Removed', 'success');
}

async function openAllTabs() {
  selectedFolderSavedTabs = savedTabs.filter(tab => tab.folderId == selectedFolderValue)
  if (selectedFolderSavedTabs.length === 0) return;

  for (const tab of selectedFolderSavedTabs) {
    chrome.tabs.create({ url: tab.url, active: false });
    await wait(80); // slight stagger to avoid browser choking
  }

  showToast(`Opened ${selectedFolderSavedTabs.length} tab${selectedFolderSavedTabs.length > 1 ? 's' : ''}!`, 'success');
}

async function clearAll() {
  selectedFolderSavedTabs = savedTabs.filter(tab => tab.folderId == selectedFolderValue)
  if (selectedFolderSavedTabs.length === 0) return;
  const count = selectedFolderSavedTabs.length;
  savedTabs = savedTabs.filter(tab => tab.folderId != selectedFolderValue);
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
  tabs.forEach(async (tab) => {
    if (tab && tab.url) {
      await addTab(tab.url, tab.title, tab.favIconUrl || '', tab.id);
    }
  })

});

addFolderBtn.addEventListener('click', async () => {
  const folderName = folderInput.value.trim();
  if (folderName) {
    const isValidFolder = validateFolderName(folderName);
    if (isValidFolder) {
      await addFolder(folderName);
      folderInput.value = '';
    }

  }
});

btnRemoveFolder.addEventListener('click', async () => {
  if (!selectedFolderValue) return;
  removeFolder(selectedFolderValue);
})

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
  selectedFolderSavedTabs = savedTabs.filter(tab => tab.folderId == selectedFolderValue)
  if (selectedFolderSavedTabs.length === 0) return;
  const confirmed = confirm(`Remove all ${selectedFolderSavedTabs.length} saved tabs?`);
  if (confirmed) clearAll();
});

// Toggle dropdown
selected.addEventListener("click", () => {
  dropdown.style.display =
    dropdown.style.display === "block" ? "none" : "block";
});

// Close on outside click
document.addEventListener("click", (e) => {
  if (!document.getElementById("selectBox").contains(e.target)) {
    dropdown.style.display = "none";
  }
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

function validateFolderName(folderName) {
  folderName = folderName.trim()
  var re = /^[^\s^\x00-\x1f\\?*:"";<>|\/.][^\x00-\x1f\\?*:"";<>|\/]*[^\s^\x00-\x1f\\?*:"";<>|\/.]+$/gm
    ;
  if (!re.test(folderName)) {
    showToast('Error: Input contains invalid characters!', 'error');
    return false;
  }
  // validation was successful
  return true;
}

function capitalizeEveryWord(str) {
  // Convert the whole string to lowercase first for consistency
  return str.toLowerCase().split(' ').map(function (word) {
    // Capitalize the first character and add the rest of the word
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' '); // Join the words back with a space
}

// ─── INIT ─────────────────────────────────────────

(async () => {
  const test = await load();
  await renderOptions();
  render();
})();
