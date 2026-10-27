/** URL plumbing for imports: normalisation, media classification, and junk heuristics. */
import type { MediaType } from './types';

export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg'] as const;
export const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'] as const;
const MEDIA_EXT = new Set<string>([...IMAGE_EXT, ...VIDEO_EXT]);

/** Matches a media URL inside arbitrary text (inline JSON, CSS, scripts). */
export const MEDIA_URL_RE = /(?:https?:)?\/\/[^\s"'<>()\\]+?\.(?:jpe?g|png|webp|gif|avif|bmp|svg|mp4|webm|mov|m4v|ogv|mkv)(?:\?[^\s"'<>()\\]*)?(?=$|[\s"'<>()\\,;])/gi;

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_[a-z]+|igshid|_ga|ref_src|yclid)$/i;

/**
 * Resolve against `base`, require http(s), drop fragments and tracking
 * parameters, lowercase the host. Returns null for anything unusable.
 */
export function normalizeUrl(raw: string, base?: string): string | null {
  let s = raw.trim().replace(/^<|>$/g, '').replace(/&amp;/g, '&');
  if (!s || s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('javascript:') || s.startsWith('#')) return null;
  if (/^www\./i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = base ? new URL(s, base) : new URL(s.startsWith('//') ? `https:${s}` : s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname || !u.hostname.includes('.')) return null;
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = '';
  return u.toString();
}

export function extOf(url: string): string {
  try {
    const path = new URL(url).pathname;
    const m = /\.([a-z0-9]{2,5})$/i.exec(path);
    return m ? m[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

/** Image CDNs often hide the format in the query string (`?format=webp`, `?fm=jpg`). */
function queryFormat(url: string): string {
  try {
    const q = new URL(url).searchParams;
    return (q.get('format') ?? q.get('fm') ?? q.get('ext') ?? q.get('mime') ?? '').toLowerCase().replace(/^.*\//, '');
  } catch {
    return '';
  }
}

export function classifyUrl(url: string): MediaType {
  const ext = extOf(url) || queryFormat(url);
  if ((IMAGE_EXT as readonly string[]).includes(ext)) return 'image';
  if ((VIDEO_EXT as readonly string[]).includes(ext)) return 'video';
  return 'page';
}

export function isMediaUrl(url: string): boolean {
  return MEDIA_EXT.has(extOf(url)) || MEDIA_EXT.has(queryFormat(url));
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function sameSite(a: string, b: string): boolean {
  const ha = hostOf(a).split('.').slice(-2).join('.');
  const hb = hostOf(b).split('.').slice(-2).join('.');
  return !!ha && ha === hb;
}

export function filenameOf(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] ?? '');
  } catch {
    return '';
  }
}

const SIZE_TOKEN = /(?:[_-](?:thumb|thumbnail|thumbs|small|medium|large|sm|md|lg|xl|th|tn|preview|square|scaled|\d{2,4}x\d{2,4}|\d{2,4}w))+(?=\.[a-z0-9]+$)/i;

/** A readable title from a file name, or '' when the name is a hash or camera counter noise. */
export function prettyFilename(url: string): string {
  let name = filenameOf(url).replace(/\.[a-z0-9]{2,5}$/i, '');
  name = name.replace(SIZE_TOKEN, '').replace(/^(?:tn|thumb|th|sm)[_-]/i, '');
  const words = name.replace(/[-_+.~]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words) return '';
  const compact = words.replace(/\s/g, '');
  if (/^[0-9a-f]{12,}$/i.test(compact) || /^\d+$/.test(compact) || compact.length > 80) return '';
  // A run of 20+ alphanumerics with digits is almost always an id, not a name.
  if (/^[a-z0-9]{20,}$/i.test(compact) && /\d/.test(compact)) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Dimensions encoded in the URL itself: WordPress `-1024x768`, `?w=1600`,
 * Blogger `/s1600/`, `=s1600`. Width only when that's all there is.
 */
export function sizeFromUrl(url: string): { width?: number; height?: number } {
  const wh = /[-_/](\d{2,5})x(\d{2,5})(?=[./_-]|$)/i.exec(url);
  if (wh) return { width: +wh[1], height: +wh[2] };
  try {
    const u = new URL(url);
    const w = u.searchParams.get('w') ?? u.searchParams.get('width');
    const h = u.searchParams.get('h') ?? u.searchParams.get('height');
    if (w && /^\d+$/.test(w)) return { width: +w, height: h && /^\d+$/.test(h) ? +h : undefined };
    const s = /[/=]s(\d{2,4})(?:-c)?(?:\/|$)/.exec(u.pathname + u.search);
    if (s) return { width: +s[1] };
  } catch {
    /* fall through */
  }
  return {};
}

/**
 * Key that collapses size variants of one image (thumb vs full) so a gallery
 * yields one candidate per picture, not three.
 */
export function variantKey(url: string): string {
  try {
    const u = new URL(url);
    for (const k of ['w', 'h', 'width', 'height', 'resize', 'fit', 'size', 'quality', 'q', 'dpr', 'crop', 'auto', 'strip']) u.searchParams.delete(k);
    let path = u.pathname
      .replace(/\/(?:thumbs?|thumbnails?|small|medium|preview|previews|resized|t|th|tn|w\d{2,4}|s\d{2,4}(?:-c)?)\//gi, '/')
      .replace(SIZE_TOKEN, '')
      .replace(/\/(?:tn|thumb|th|sm)[_-]([^/]+)$/i, '/$1');
    path = path.replace(/\.(jpe?g)$/i, '.jpg');
    return `${u.hostname.replace(/^www\./, '')}${path}?${u.searchParams.toString()}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

const THUMB_NAME = /(?:[_-](?:thumb|thumbnail|thumbs|small|sm|th|tn|preview|square))+\.[a-z0-9]+$|^(?:tn|thumb|th|sm)[_-]/i;

/** True when the URL itself says it's a thumbnail (as opposed to merely sized). */
export function looksLikeThumb(url: string): boolean {
  return THUMB_NAME.test(filenameOf(url)) || /\/(thumbs?|thumbnails?|tn|th|small|preview|previews|resized)\//i.test(url);
}

/** Ad networks, trackers, and the adult-ad exchanges that wallpaper gallery sites. */
const AD_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'adservice.google.com', 'facebook.net', 'scorecardresearch.com', 'quantserve.com', 'adnxs.com', 'criteo.com', 'criteo.net', 'taboola.com',
  'outbrain.com', 'amazon-adsystem.com', 'moatads.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'adsrvr.org', 'casalemedia.com',
  'exoclick.com', 'exosrv.com', 'trafficjunky.net', 'trafficjunky.com', 'juicyads.com', 'trafficstars.com', 'tsyndicate.com', 'ero-advertising.com',
  'adsterra.com', 'propellerads.com', 'popads.net', 'popcash.net', 'plugrush.com', 'adspyglass.com', 'clickadu.com', 'hilltopads.net',
  'adxpansion.com', 'twinred.com', 'realsrv.com', 'magsrv.com', 'a-ads.com', 'mgid.com', 'revcontent.com', 'statcounter.com', 'hotjar.com',
  'clarity.ms', 'yandex.ru/watch', 'mc.yandex.ru', 'bat.bing.com', 'pixel.wp.com', 'stats.wp.com', 'gravatar.com',
];

export function isAdHost(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (url.includes('facebook.com/tr')) return true;
  return AD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || (h.includes('/') && url.includes(h)));
}

const JUNK_NAME = /(?:^|[^a-z])(logo|icon|favicon|sprite|spacer|blank|pixel|beacon|tracking|tracker|badge|avatar|emoji|emoticon|button|btn|arrow|loader|loading|spinner|placeholder|transparent|1x1|clear|rss|social|share|banner[-_]?ad|ads?)(?:[^a-z]|$)/i;

/** File names that are almost never content: logos, icons, spacers, pixels, spinners. */
export function looksLikeJunk(url: string): boolean {
  const name = filenameOf(url).toLowerCase();
  if (/\.ico$/.test(name)) return true;
  if (/\/(icons?|emoji|smilies|sprites?|logos?|badges?|avatars?)\//i.test(url)) return true;
  return JUNK_NAME.test(name);
}
