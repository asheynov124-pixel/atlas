// One careful page fetcher for every server-side read of a public page.
// Used only for pages the app is asked to look at (a pasted link, a product the pool is verifying),
// never for crawling.

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  html: string;
  contentType: string;
  redirects: string[];
  ms: number;
  error?: string;
}

// A current mobile Safari UA. Many retailers serve a bot wall to unknown agents; we identify as the
// device she actually uses, and we still treat any wall as "blocked" rather than trying to beat it.
export const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 8;

export async function fetchPage(
  url: string,
  { timeoutMs = 10_000, accept = "text/html,application/xhtml+xml" } = {},
): Promise<FetchedPage> {
  const started = Date.now();
  const redirects: string[] = [];
  let current = url;
  try {
    // Follow redirects by hand so affiliate hops (liketk.it, rstyle.me, grounding redirects) are recorded.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": BROWSER_UA,
          accept,
          "accept-language": "en-US,en;q=0.9",
        },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        redirects.push(current);
        current = new URL(location, current).toString();
        await res.body?.cancel();
        continue;
      }
      const html = await readCapped(res);
      return {
        requestedUrl: url,
        finalUrl: current,
        status: res.status,
        ok: res.ok,
        html,
        contentType: res.headers.get("content-type") ?? "",
        redirects,
        ms: Date.now() - started,
      };
    }
    return failed(url, current, redirects, started, "too many redirects");
  } catch (err) {
    return failed(url, current, redirects, started, describe(err));
  }
}

// Resolve a redirect URL (affiliate link, grounding redirect) to where it lands, without reading the body.
export async function resolveRedirects(url: string, timeoutMs = 8_000): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": BROWSER_UA },
    });
    await res.body?.cancel();
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return current;
  }
  return current;
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function failed(
  requestedUrl: string,
  finalUrl: string,
  redirects: string[],
  started: number,
  error: string,
): FetchedPage {
  return {
    requestedUrl,
    finalUrl,
    status: 0,
    ok: false,
    html: "",
    contentType: "",
    redirects,
    ms: Date.now() - started,
    error,
  };
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    return cause instanceof Error ? `${err.message}: ${cause.message}` : err.message;
  }
  return String(err);
}
