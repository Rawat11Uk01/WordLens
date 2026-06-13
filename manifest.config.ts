import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'PDF Smart Dictionary',
  version: pkg.version,
  description:
    'Read any PDF and instantly look up meanings, synonyms, pronunciation & AI context explanations (local Ollama). 100% free, no API keys.',
  icons: {
    '16': 'src/assets/icons/icon16.png',
    '32': 'src/assets/icons/icon32.png',
    '48': 'src/assets/icons/icon48.png',
    '128': 'src/assets/icons/icon128.png'
  },
  action: {
    default_title: 'Open PDF Smart Dictionary',
    default_icon: {
      '16': 'src/assets/icons/icon16.png',
      '32': 'src/assets/icons/icon32.png',
      '48': 'src/assets/icons/icon48.png',
      '128': 'src/assets/icons/icon128.png'
    }
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module'
  },
  options_page: 'src/vocabulary/index.html',
  permissions: ['storage', 'contextMenus', 'scripting', 'activeTab'],
  host_permissions: [
    'https://api.dictionaryapi.dev/*',
    'http://localhost/*',
    'http://127.0.0.1/*'
  ],
  commands: {
    'lookup-selection': {
      suggested_key: {
        default: 'Ctrl+Shift+L',
        mac: 'Command+Shift+L'
      },
      description: 'Look up the currently selected word'
    },
    'open-viewer': {
      suggested_key: {
        default: 'Ctrl+Shift+U',
        mac: 'Command+Shift+U'
      },
      description: 'Open the PDF Smart Dictionary viewer'
    }
  },
  web_accessible_resources: [
    {
      resources: ['*.wasm'],
      matches: ['<all_urls>']
    }
  ]
})
