/// <reference types="chrome" />
import type { RuntimeMessage } from '@/lib/types'

const VIEWER_PATH = 'index.html'
const CONTEXT_MENU_ID = 'psd-lookup'

function viewerUrl(lookup?: string): string {
  const base = chrome.runtime.getURL(VIEWER_PATH)
  return lookup ? `${base}?lookup=${encodeURIComponent(lookup)}` : base
}

/** Open the PDF viewer in a new tab (or focus an existing one). */
async function openViewer(lookup?: string): Promise<void> {
  await chrome.tabs.create({ url: viewerUrl(lookup) })
}

/** Send a message to a tab; returns false if no receiver was present. */
function sendToTab(tabId: number, message: RuntimeMessage): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      resolve(!chrome.runtime.lastError)
    })
  })
}

/* ------------------------------- Lifecycle ------------------------------- */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Explain “%s” with PDF Smart Dictionary',
    contexts: ['selection']
  })
})

/* ------------------------------ Toolbar icon ----------------------------- */
chrome.action.onClicked.addListener(() => {
  void openViewer()
})

/* ------------------------------ Context menu ----------------------------- */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return
  const text = (info.selectionText ?? '').trim()
  if (!text) return

  // If the click happened inside our own viewer tab, reuse it.
  if (tab?.id && tab.url?.startsWith(chrome.runtime.getURL(''))) {
    const delivered = await sendToTab(tab.id, { type: 'LOOKUP_TEXT', text })
    if (delivered) return
  }
  // Otherwise open a fresh viewer pre-loaded with the selected word.
  await openViewer(text)
})

/* ------------------------------- Commands -------------------------------- */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-viewer') {
    await openViewer()
    return
  }
  if (command === 'lookup-selection') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id && tab.url?.startsWith(chrome.runtime.getURL(''))) {
      await sendToTab(tab.id, { type: 'LOOKUP_SELECTION' })
    } else {
      await openViewer()
    }
  }
})
