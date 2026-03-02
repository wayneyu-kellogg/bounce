import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Focus Agent',
  version: '0.1.0',
  description: 'Get Back on Track with focused browsing guardrails.',
  action: {
    default_title: 'Focus Agent',
    default_popup: 'popup.html',
  },
  options_page: 'bouncer.html',
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  permissions: ['storage', 'declarativeNetRequest', 'alarms', 'tabs'],
  host_permissions: ['<all_urls>', 'http://localhost:8787/*'],
  content_scripts: [
    {
      matches: ['*://*.youtube.com/*'],
      js: ['src/content/youtubeSanitizer.ts'],
      run_at: 'document_end',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['bouncer.html'],
      matches: ['<all_urls>'],
    },
  ],
})