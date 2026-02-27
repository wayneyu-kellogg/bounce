import type { ExtensionMessage, ExtensionResponse } from '../lib/messages'

const STYLE_ID = 'bounce-youtube-sanitizer-style'
const BANNER_ID = 'bounce-youtube-research-banner'

const sanitizeCss = `
  ytd-rich-grid-renderer,
  ytd-two-column-browse-results-renderer,
  ytd-browse[page-subtype="home"] #contents,
  ytd-browse[page-subtype="home"] #primary,
  ytd-browse[page-subtype="home"] ytd-rich-item-renderer,
  ytd-browse[page-subtype="home"] ytd-rich-section-renderer,
  ytd-browse[page-subtype="home"] ytd-rich-grid-row,
  ytd-browse[page-subtype="home"] ytd-video-renderer,
  ytd-browse[page-subtype="home"] ytd-shelf-renderer,
  ytd-browse[page-subtype="home"] ytd-reel-shelf-renderer,
  ytd-watch-next-secondary-results-renderer,
  #related,
  ytd-reel-shelf-renderer,
  ytd-rich-shelf-renderer[is-shorts],
  ytd-comments,
  #comments,
  ytd-comment-thread-renderer,
  ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"] {
    display: none !important;
  }
`

const sendMessage = (message: ExtensionMessage) =>
  chrome.runtime.sendMessage<ExtensionMessage, ExtensionResponse>(message)

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = sanitizeCss
  document.documentElement.appendChild(style)
}

const ensureBanner = () => {
  if (document.getElementById(BANNER_ID)) {
    return
  }

  const banner = document.createElement('div')
  banner.id = BANNER_ID
  banner.innerHTML = [
    '<div style="font-size:13px;font-weight:700;line-height:1.1;letter-spacing:0.02em;">Research Mode Active</div>',
    '<div style="margin-top:4px;font-size:11px;font-weight:500;line-height:1.2;opacity:0.92;">Recommendations, Shorts, and comments are hidden.</div>',
  ].join('')
  banner.setAttribute(
    'style',
    [
      'position: fixed',
      'top: 64px',
      'left: 50%',
      'transform: translateX(-50%)',
      'z-index: 2147483647',
      'padding: 10px 14px',
      'border-radius: 14px',
      'min-width: 260px',
      'text-align: center',
      'background: rgba(220, 38, 38, 0.95)',
      'color: #ffffff',
      'box-shadow: 0 6px 18px rgba(220, 38, 38, 0.35)',
      'pointer-events: none',
      'backdrop-filter: blur(4px)',
    ].join('; '),
  )

  document.documentElement.appendChild(banner)
}

const removeStyle = () => {
  const existing = document.getElementById(STYLE_ID)
  if (existing) {
    existing.remove()
  }
}

const removeBanner = () => {
  const existing = document.getElementById(BANNER_ID)
  if (existing) {
    existing.remove()
  }
}

const syncSanitizerState = async () => {
  try {
    const response = await sendMessage({
      type: 'GET_SANITIZER_STATE',
      payload: { domain: window.location.hostname },
    })

    if (!response.ok) {
      removeStyle()
      return
    }

    if (response.sanitizeEnabled) {
      ensureStyle()
      ensureBanner()
      return
    }

    removeStyle()
    removeBanner()
  } catch {
    removeStyle()
    removeBanner()
  }
}

let lastUrl = window.location.href

const observeNavigation = () => {
  const observer = new MutationObserver(() => {
    if (window.location.href === lastUrl) {
      return
    }

    lastUrl = window.location.href
    void syncSanitizerState()
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

void syncSanitizerState()
observeNavigation()
window.setInterval(() => {
  void syncSanitizerState()
}, 2000)
