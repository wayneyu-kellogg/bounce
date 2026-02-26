import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Bounce',
  version: '0.1.0',
  description: 'MVP productivity bouncer for focus sessions.',
  action: {
    default_title: 'Bounce',
    default_popup: 'popup.html',
  },
  options_page: 'bouncer.html',
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  permissions: ['storage', 'declarativeNetRequest', 'alarms', 'tabs'],
  host_permissions: ['<all_urls>', 'http://localhost:8787/*'],
  web_accessible_resources: [
    {
      resources: ['bouncer.html'],
      matches: ['<all_urls>'],
    },
  ],
})