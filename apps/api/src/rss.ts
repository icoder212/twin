/** RSS from official sites (the Fed, the Bank of England, the ECB): read as text, never rendered. */

const USER_AGENT = 'DeskTwin/0.1 (+https://twin.alchmai.com)';
const MAX_BYTES = 512 * 1024;

export interface RssItem {
  id: string;
  title: string;
  link: string;
  at: number;
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Turns &amp;, &#39; and the like back into the characters they stand for. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi, (entity, code: string) => {
    if (code.startsWith('#')) {
      const point =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : '';
    }
    return NAMED[code.toLowerCase()] ?? entity;
  });
}

function unwrap(value: string): string {
  return value
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '')
    .trim();
}

/** Items whose link is on the expected site; anything else in the feed is dropped. */
export function parseRss(xml: string, linkPrefix: string): RssItem[] {
  const items: RssItem[] = [];
  for (const [, body = ''] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const tag = (name: string) =>
      unwrap(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(body)?.[1] ?? '');
    const link = decodeEntities(tag('link'));
    const at = Date.parse(tag('pubDate'));
    if (!link.startsWith(linkPrefix) || Number.isNaN(at)) continue;
    const title = decodeEntities(tag('title')).replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!title) continue;
    items.push({ id: (tag('guid') || link).slice(0, 200), title, link, at });
  }
  return items;
}

export async function getText(url: string, fetchFn: typeof fetch): Promise<string> {
  const response = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return (await response.text()).slice(0, MAX_BYTES);
}
