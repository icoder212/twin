/**
 * The morning brief as an HTML email, beside the plain-text one. Every piece of text, including
 * headlines from outside sources, is escaped; the only markup is this file's own. Styles are inline
 * because email clients drop style sheets.
 */

/** One line of the brief; `strong` is the part shown in bold in the email, when there is one. */
export interface BriefItem {
  text: string;
  strong?: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

function itemHtml(item: BriefItem): string {
  const at = item.strong ? item.text.indexOf(item.strong) : -1;
  if (!item.strong || at < 0) return escapeHtml(item.text);
  const end = at + item.strong.length;
  return `${escapeHtml(item.text.slice(0, at))}<strong>${escapeHtml(item.strong)}</strong>${escapeHtml(item.text.slice(end))}`;
}

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function briefHtml(brief: {
  title: string;
  sections: Array<{ heading: string; items: BriefItem[] }>;
  notes: string[];
  footer: string;
}): string {
  const sections = brief.sections
    .map(
      (s) =>
        `<h2 style="font-size:15px;margin:22px 0 6px;color:#111111">${escapeHtml(s.heading)}</h2>` +
        `<ul style="margin:0;padding-left:20px">${s.items
          .map((i) => `<li style="margin:3px 0">${itemHtml(i)}</li>`)
          .join('')}</ul>`,
    )
    .join('');
  const small = 'font-size:12px;line-height:1.5;color:#555555;margin:6px 0';
  return [
    '<!doctype html><html><head><meta charset="utf-8"></head>',
    `<body style="margin:0;padding:24px;background:#ffffff;color:#1a1a1a;font-family:${FONT};font-size:14px;line-height:1.55">`,
    '<div style="max-width:660px">',
    `<h1 style="font-size:19px;margin:0 0 4px;color:#111111">${escapeHtml(brief.title)}</h1>`,
    sections,
    '<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 10px">',
    ...brief.notes.map((n) => `<p style="${small}">${escapeHtml(n)}</p>`),
    `<p style="${small}">${escapeHtml(brief.footer)}</p>`,
    '</div></body></html>',
  ].join('');
}
