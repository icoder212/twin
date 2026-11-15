import { describe, expect, it } from 'vitest';
import { briefHtml } from './brief-email';

describe('the brief as HTML email', () => {
  it('escapes every piece of text and bolds only the marked part', () => {
    const html = briefHtml({
      title: 'Morning brief <b>',
      sections: [
        {
          heading: 'Yesterday in the news',
          items: [
            { text: 'US: <script>alert(1)</script> & "quotes"', strong: 'US:' },
            { text: 'Oil: no change', strong: 'not in the text' },
          ],
        },
      ],
      notes: ['Facts only <i>'],
      footer: 'Reference DT-1 & more',
    });
    expect(html).toContain(
      '<strong>US:</strong> &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;',
    );
    expect(html).toContain('<li style="margin:3px 0">Oil: no change</li>');
    expect(html).toContain('Morning brief &lt;b&gt;');
    expect(html).toContain('Facts only &lt;i&gt;');
    expect(html).toContain('Reference DT-1 &amp; more');
    expect(html).not.toContain('<script>');
  });
});
