// Renders every diagram in specs.js to PNG: ELK lays it out (orthogonal
// edges), the browser draws Gane-Sarson shapes as SVG, Playwright screenshots.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const specs = require('./specs.js');

const OUT = path.join(__dirname, 'png');
fs.mkdirSync(OUT, { recursive: true });

const pageScript = fs.readFileSync(path.join(__dirname, 'node_modules/elkjs/lib/elk.bundled.js'), 'utf8');

async function main() {
  const only = process.argv[2];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const page = await browser.newPage({ deviceScaleFactor: 2.5 });
  await page.setContent('<html><body style="margin:0;background:#fff"></body></html>');
  await page.addScriptTag({ content: pageScript });
  await page.addScriptTag({ path: path.join(__dirname, 'draw.js') });
  const meta = [];
  for (const d of specs) {
    if (only && d.id !== only) continue;
    // Portrait Letter, 1 in margins (like the sample): keep whichever direction fills it at the larger scale.
    const fit = (sz) => Math.min(6.5 / sz.w, 8.4 / sz.h);
    let size = await page.evaluate((spec) => window.drawDiagram(spec), d);
    if (!(d.layout && d.layout['elk.direction'])) {
      const down = { ...d, layout: { ...(d.layout || {}), 'elk.direction': 'DOWN' } };
      const sizeDown = await page.evaluate((spec) => window.drawDiagram(spec), down);
      if (fit(sizeDown) > fit(size) * 1.05) size = { ...sizeDown, dir: 'DOWN' };
      else size = await page.evaluate((spec) => window.drawDiagram(spec), d);
    }
    const el = await page.$('#diagram');
    await el.screenshot({ path: path.join(OUT, d.id + '.png') });
    meta.push({ id: d.id, ...size });
    console.log(d.id, size.w, 'x', size.h, size.dir || '');
  }
  if (!only) fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
