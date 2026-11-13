import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const output = process.argv[2];
if (!output) throw new Error('Provide an output JSON path.');
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage();
  await page.route('https://**/*', route => route.abort());
  await page.goto(pathToFileURL(resolve('pune_to_konkan.html')).href);
  await page.waitForFunction(() => window.__atlas?.store);
  if (process.argv[3]) await page.evaluate(language => {
    const select = document.getElementById('language-select');
    select.value = language;
    select.dispatchEvent(new Event('change'));
  }, process.argv[3]);
  const texts = new Set();
  const capture = async () => {
    const values = await page.evaluate(() => {
      const values = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('script,style,pre,noscript,.source-list,[data-original-source],.maplibregl-ctrl-attrib-inner,#language-select option')) continue;
        if (/[A-Za-z]/.test(node.textContent)) values.push(node.textContent.trim());
      }
      for (const element of document.querySelectorAll('[title],[aria-label],[placeholder],[aria-valuetext]')) {
        if (element.closest('[data-original-source],.source-list,.maplibregl-ctrl-attrib-inner,#language-select option')) continue;
        for (const key of ['title', 'aria-label', 'placeholder', 'aria-valuetext']) {
          if (element.getAttribute(key)) values.push(element.getAttribute(key));
        }
      }
      return values;
    });
    for (const value of values) texts.add(value);
  };
  await capture();
  const ids = await page.evaluate(() => window.__atlas.atlas.ghats.map(ghat => ghat.id));
  for (const id of ids) {
    await page.evaluate(id => {
      window.__atlas.store.dispatch({ type: 'focus', mode: 'ghats', id });
      if (id === 'bor') window.__atlas.store.dispatch({ type: 'bor-alignment', id: 'old-highway' });
      document.querySelectorAll('#detail-content details, #route-list details').forEach(details => { details.open = true; });
    }, id);
    await page.waitForTimeout(30);
    await capture();
  }
  await page.evaluate(() => {
    const state = window.__atlas.store;
    const routes = window.__atlas.atlas.routes.filter(route => route.beachId === 'alibag');
    for (const route of routes) state.dispatch({ type: 'toggle-route', id: route.id });
    state.dispatch({ type: 'comparison', open: true });
  });
  await capture();
  await writeFile(output, JSON.stringify([...texts].sort(), null, 2) + '\n');
  console.log(`Collected ${texts.size} distinct display strings.`);
} finally {
  await browser.close();
}
