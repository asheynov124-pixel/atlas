// Where the book is running. `npm run build:artifact` builds it for the claude.ai
// artifact viewer, which frames the page: no service worker, no print dialog, no Web
// Share, and files leave only through the viewer's own `downloads` prompt.

export const IN_ARTIFACT = import.meta.env.MODE === 'artifact';

export interface ArtifactDownloads {
  save(request: { filename: string; data: Blob | ArrayBuffer | string }): Promise<{ status: 'saved' | 'delivered' }>;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

let downloads: Promise<ArtifactDownloads | null> | null = null;

/** The viewer's save prompt, or null where this view cannot save files. */
export function artifactDownloads(): Promise<ArtifactDownloads | null> {
  if (!IN_ARTIFACT || typeof window === 'undefined' || !window.claude?.use) return Promise.resolve(null);
  downloads ??= window.claude.use('downloads').then(
    (d) => (d as ArtifactDownloads | null) ?? null,
    () => null,
  );
  return downloads;
}

const PLACE = 'bannehr:place';

/** In the viewer the address bar never shows our #/p/… hash, so remember the page here. */
export function rememberPlace(spreadId: string) {
  if (!IN_ARTIFACT) return;
  try {
    localStorage.setItem(PLACE, spreadId);
  } catch {
    /* storage blocked: the book opens at the cover next time */
  }
}

export function rememberedPlace(): string | null {
  if (!IN_ARTIFACT) return null;
  try {
    return localStorage.getItem(PLACE);
  } catch {
    return null;
  }
}
