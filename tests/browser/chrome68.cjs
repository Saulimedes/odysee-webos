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
      try { if ((await fetch('http://127.0.0.1:3335')).ok) { ready = true; break; } } catch { }
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
    await page.waitForFunction(() => !document.getElementById('boot'));
    await page.waitForSelector('.videoRow .card');
    const titles = () => page.$$eval('.videoRow__title', (nodes) => nodes.map((node) => node.textContent));
    assert.deepEqual((await titles()).slice(0, 2), ['Featured', 'Gaming']);

    await press(page, 'ArrowRight');
    assert.equal(await page.$eval('.card--active .card__title', (node) => node.textContent), 'Trending video 1-1');
    await press(page, 'ArrowDown');
    assert.equal(await page.$eval('.card--active .card__title', (node) => node.textContent), 'Trending video 1-0');

    await press(page, 'Enter');
    await page.waitForSelector('video.player__video');
    await page.waitForFunction(() => document.querySelector('video.player__video').currentTime > 0);
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
    await page.waitForSelector('.settingsPage .row');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    const accentAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    assert.notEqual(accentAfter, accentBefore, 'accent color changes from Settings');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('appearance_boot')).vars['--accent']), accentAfter);

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
