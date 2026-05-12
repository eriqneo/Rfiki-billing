export const STORAGE_NOTICE_KEY = 'rafiki_storage_notice_accepted_v1';
export const PWA_INSTALL_PROMPT_KEY = 'rafiki_pwa_install_prompt_handled_v1';

export function hasAcceptedStorageNotice() {
  try {
    return localStorage.getItem(STORAGE_NOTICE_KEY) === 'true';
  } catch {
    return true;
  }
}

export function acceptStorageNotice() {
  try {
    localStorage.setItem(STORAGE_NOTICE_KEY, 'true');
  } catch {
    // Storage can be unavailable in hardened/private browser modes.
  }
}

export function hasHandledPwaInstallPrompt() {
  try {
    return localStorage.getItem(PWA_INSTALL_PROMPT_KEY) === 'true';
  } catch {
    return true;
  }
}

export function markPwaInstallPromptHandled() {
  try {
    localStorage.setItem(PWA_INSTALL_PROMPT_KEY, 'true');
  } catch {
    // Storage can be unavailable in hardened/private browser modes.
  }
}
