import { Platform } from 'react-native';

function sanitizeDomIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function blurActiveWebElement() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return;
  }

  const activeElement = document.activeElement as HTMLElement | null;
  activeElement?.blur?.();
}

export function runAfterWebBlur(callback: () => void) {
  blurActiveWebElement();

  if (Platform.OS === 'web' && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      callback();
    });
    return;
  }

  callback();
}

export async function runAsyncAfterWebBlur<T>(callback: () => Promise<T> | T): Promise<T> {
  blurActiveWebElement();

  if (Platform.OS === 'web' && typeof requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  return callback();
}

export function buildWebInputId(...parts: Array<string | undefined | null>) {
  if (Platform.OS !== 'web') {
    return undefined;
  }

  const id = parts
    .map((part) => sanitizeDomIdPart(part ?? ''))
    .filter(Boolean)
    .join('-');

  return id || undefined;
}
