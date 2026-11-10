const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const { fixture } = require('./fixtures.cjs');

const revision = '561732';
const press = async (page, key, times = 1) => { for (let index = 0; index < times; index++) await page.keyboard.press(key); };

async function main() {
  const server = fork(path.join(__dirname, 'server.cjs'), [], { env: { ...process.env, TEST_PORT: '3335' }, stdio: 'inherit' });
  let browser;
  let page;
  const errors = [];
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch('http://127.0.0.1:3335')).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Production server did not start. Run npm run build first.');
    let executablePath = process.env.CHROME68_EXECUTABLE_PATH;
    if (!executablePath) {
      const fetcher = puppeteer.createBrowserFetcher({ path: process.env.CHROME68_CACHE || path.join(os.tmpdir(), 'odysee-chrome68') });
      executablePath = (await fetcher.download(revision)).executablePath;
    }
    browser = await puppeteer.launch({ executablePath, headless: true,
      env: fs.existsSync('/usr/share/fonts/truetype/dejavu') ? { ...process.env, FONTCONFIG_FILE: path.join(__dirname, 'fonts.conf') } : process.env,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
    assert.match(await browser.version(), /(?:Chrome|Chromium)\/68\./);
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      if (new URL(request.url()).hostname === '127.0.0.1') return request.continue();
      try {
        const response = fixture(request.url(), request.postData(), request.method());
        if (!response) throw Error(`Unexpected external request: ${request.url()}`);
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': '*' };
        const range = /bytes=(\d+)-(\d*)/.exec(request.headers().range || '');
        if (range && Buffer.isBuffer(response.body)) {
          const total = response.body.length;
          const start = Number(range[1]);
          const end = range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
          await request.respond({ status: 206, contentType: response.contentType, body: response.body.slice(start, end + 1), headers: { ...cors, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${total}` } });
        } else {
          await request.respond({ ...response, headers: { ...cors, 'Accept-Ranges': 'bytes' } });
        }
      } catch (error) {
        errors.push(String(error));
        await request.abort();
      }
    });

    await page.goto('http://127.0.0.1:3335');
    const boot = await page.evaluate(() => {
      const logo = document.querySelector('#boot .logo');
      const image = document.querySelector('#boot .logo img');
      return logo && image && { loaded: image.complete && image.naturalWidth > 0, source: image.getAttribute('src'), background: getComputedStyle(logo).backgroundColor, bars: document.querySelectorAll('#boot svg path').length };
    });
    assert.deepEqual(boot, { loaded: true, source: 'odysee-logo.png', background: 'rgba(0, 0, 0, 0)', bars: 12 }, 'start screen shows the astronaut inside the wheel');
    await page.waitForFunction(() => !document.getElementById('boot'));
    await page.waitForSelector('.videoRow .card');
    const bar = await page.evaluate(() => {
      const box = (node) => { const rect = node.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; };
      const items = Array.from(document.querySelectorAll('.sidebar__main .sidebar__item')).map(box);
      return { height: window.innerHeight, brand: box(document.querySelector('.sidebar__brand')), first: items[0], last: items[items.length - 1], settings: box(document.querySelector('.sidebar__group--bottom .sidebar__item')) };
    });
    const middle = (bar.first.top + bar.last.bottom) / 2;
    assert.ok(Math.abs(middle - bar.height / 2) < 40, `menu entries are centered, middle at ${middle} of ${bar.height}`);
    assert.ok(bar.brand.bottom < bar.first.top, 'logo is above the entries');
    assert.ok(bar.settings.top > bar.last.bottom && bar.height - bar.settings.bottom < 60, 'Settings is at the bottom');
    const titles = () => page.$$eval('.videoRow__title', (nodes) => nodes.map((node) => node.textContent));
    assert.deepEqual((await titles()).slice(0, 2), ['Featured', 'Gaming']);

    await press(page, 'ArrowRight');
    assert.equal(await page.$eval('.card--active .card__title', (node) => node.textContent), 'Trending video 1-1');
    await press(page, 'ArrowDown');
    assert.equal(await page.$eval('.card--active .card__title', (node) => node.textContent), 'Trending video 1-0');

    await press(page, 'Enter');
    await page.waitForSelector('video.player__video');
    await page.waitForFunction(() => document.querySelector('video.player__video').currentTime > 0);
    assert.match(await page.$eval('video.player__video', (node) => node.src), /^https:\/\/odysee\.com\/\$\/download\/video-/, 'plays the original through the download address of the website');

    await page.waitForSelector('.timeline__handle');
    const track = await page.$eval('.timeline__track', (node) => { const rect = node.getBoundingClientRect(); return { x: rect.left, y: rect.top + rect.height / 2, width: rect.width }; });
    await page.mouse.move(track.x + track.width * 0.2, track.y);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.5, track.y, { steps: 6 });
    const dragged = await page.$eval('.timeline__handle', (node) => ({ active: node.className.indexOf('timeline__handle--active') >= 0, left: parseFloat(node.style.left) }));
    assert.ok(dragged.active, 'the handle is raised while it is dragged');
    assert.ok(Math.abs(dragged.left - 50) < 3, `the handle follows the pointer, at ${dragged.left}%`);
    await page.mouse.up();
    await page.waitForFunction(() => Math.abs(document.querySelector('video.player__video').currentTime - 300) < 5, { timeout: 10000 });
    await page.mouse.move(track.x + 2, track.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('video.player__video').currentTime < 15, { timeout: 10000 });

    const clock = () => page.$eval('video.player__video', (node) => node.currentTime);
    await press(page, 'Enter');
    await page.waitForFunction(() => document.querySelector('video.player__video').paused, { timeout: 5000 });
    await page.evaluate(() => document.querySelector('video.player__video').dispatchEvent(new Event('error')));
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.ok(await page.$eval('video.player__video', (node) => node.paused), 'a paused video stays paused when its stream breaks');
    assert.equal(await page.$eval('.player__error', () => 1).catch(() => 0), 0, 'a broken paused stream shows no error');
    const stopped = await clock();
    await press(page, 'Enter');
    await page.waitForFunction(() => !document.querySelector('video.player__video').paused, { timeout: 10000 });
    await page.waitForFunction((from) => document.querySelector('video.player__video').currentTime > from, { timeout: 10000 }, stopped);
    assert.ok(Math.abs((await clock()) - stopped) < 8, 'play continues where the video was paused');

    const menuEntries = () => page.$$eval('.picker .pickerItem', (nodes) => nodes.map((node) => node.textContent));
    await press(page, 'ArrowRight', 4);
    await press(page, 'Enter');
    await page.waitForSelector('.picker');
    assert.deepEqual(await menuEntries(), ['Aspect RatioAuto', 'Playback Speed1\u00d7', 'Video QualityAuto']);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await press(page, 'ArrowDown', 2);
    await press(page, 'Enter');
    assert.equal(await page.$eval('video.player__video', (node) => node.playbackRate), 1.5, 'speed menu changes the playback rate');
    await press(page, 'Enter');
    await press(page, 'Enter');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    assert.equal(await page.$eval('video.player__video', (node) => node.style.objectFit), 'cover', 'aspect menu zooms the video');
    await press(page, 'Enter');
    assert.deepEqual(await menuEntries(), ['Aspect RatioZoom', 'Playback Speed1.5\u00d7', 'Video QualityAuto']);
    await press(page, 'Escape', 2);

    await page.waitForFunction(() => !document.querySelector('.player__controls--visible'), { timeout: 15000 });
    await press(page, 'ArrowRight', 3);
    await page.waitForFunction(() => document.querySelector('video.player__video').currentTime > 35);
    await press(page, 'Escape', 2);
    await page.waitForSelector('.videoRows');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('continue_watching')).items[0].positionSeconds);
    assert.ok(saved > 35, `saved position ${saved}`);

    await press(page, 'ArrowUp', 2);
    assert.equal((await titles())[0], 'Continue Watching', 'Continue Watching row appears after leaving the player');
    await press(page, 'Enter');
    await page.waitForSelector('video.player__video');
    await page.waitForFunction((position) => document.querySelector('video.player__video').currentTime >= position - 1, {}, saved);
    await press(page, 'Escape', 2);

    await page.reload();
    await page.waitForFunction(() => !document.getElementById('boot'));
    await page.waitForSelector('.videoRow .card');
    assert.equal(await page.$eval('.videoRow__title', (node) => node.textContent), 'Continue Watching');

    await press(page, 'Escape');
    await press(page, 'ArrowLeft', 3);
    const accentBefore = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    await page.evaluate(() => Array.from(document.querySelectorAll('.sidebar__item')).find((node) => node.textContent.includes('Settings')).click());
    await page.waitForSelector('.masterDetail__detail .row');
    assert.equal(await page.$eval('.masterDetail__list .entry--selected .entry__label', (node) => node.textContent), 'Appearance');
    assert.deepEqual(await page.$$eval('.masterDetail__list .entry__label', (nodes) => nodes.map((node) => node.textContent)), ['Appearance', 'Customize', 'Language', 'Playback', 'Account', 'About']);
    assert.equal(await page.$('.row--active'), null, 'the list of pages has the focus, not the rows');
    await press(page, 'ArrowRight');
    await page.waitForSelector('.row--active');
    await press(page, 'ArrowDown');
    assert.equal(await page.$eval('.row--active .row__label', (node) => node.textContent), 'Accent Color');
    await press(page, 'Enter');
    await page.waitForSelector('.picker');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await page.waitForFunction(() => !document.querySelector('.picker'));
    const accentAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    assert.notEqual(accentAfter, accentBefore, 'accent color changes from Settings');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('appearance_boot')).vars['--accent']), accentAfter);

    await press(page, 'ArrowDown', 2);
    assert.equal(await page.$eval('.row--active .row__label', (node) => node.textContent), 'Loading Animation');
    await press(page, 'Enter');
    await page.waitForSelector('.picker .loader-typing');
    const loaders = await page.evaluate((accent) => {
      const style = (name) => getComputedStyle(document.querySelector(`.picker .${name}`));
      const arcs = style('loader-arcs');
      const dots = style('loader-typing');
      return { arcs: arcs.animationName, arcColor: arcs.borderTopColor, dots: dots.animationName, clip: dots.clipPath, repeat: dots.backgroundRepeat, accent };
    }, accentAfter);
    assert.equal(loaders.arcs, 'loader-half');
    assert.equal(loaders.dots, 'loader-typing');
    assert.notEqual(loaders.clip, 'none', 'growing dots are clipped');
    assert.ok(loaders.repeat.indexOf('space') >= 0, 'growing dots space their dots out');
    assert.notEqual(loaders.arcColor, 'rgba(0, 0, 0, 0)', 'arcs are drawn in the accent color');
    await press(page, 'Escape');
    await page.waitForFunction(() => !document.querySelector('.picker'));

    await page.evaluate(() => Array.from(document.querySelectorAll('.sidebar__item')).find((node) => node.textContent.includes('Categories')).click());
    await page.waitForSelector('.masterDetail .entry');
    assert.equal(await page.$('.masterDetail--collapsed'), null, 'the list of categories shows its names first');
    const wide = await page.$eval('.masterDetail__list', (node) => node.getBoundingClientRect().width);
    await press(page, 'ArrowRight');
    await page.waitForSelector('.masterDetail--collapsed');
    const narrow = await page.$eval('.masterDetail__list', (node) => node.getBoundingClientRect().width);
    assert.ok(narrow < wide / 3, `list shrinks from ${wide} to ${narrow}`);
    await press(page, 'Escape');
    await page.waitForFunction(() => !document.querySelector('.masterDetail--collapsed'));

    await page.evaluate(() => localStorage.setItem('uiLanguage', '"de"'));
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('boot'));
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'de');
    assert.ok((await page.$$eval('.sidebar__label', (nodes) => nodes.map((node) => node.textContent))).includes('Einstellungen'), 'the menu is in German');

    assert.deepEqual(errors, []);
    console.log('Chrome 68: startup, rows, player, resume, continue watching, and settings passed.');
  } catch (error) {
    fs.mkdirSync('test-results', { recursive: true });
    if (page) await page.screenshot({ path: 'test-results/chrome68.png' }).catch(() => {});
    fs.writeFileSync('test-results/chrome68.log', [String(error.stack || error), ...errors].join('\n'));
    throw error;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
