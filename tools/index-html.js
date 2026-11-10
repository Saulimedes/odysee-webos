const fs = require('fs');
const path = require('path');

const BRANDING = path.resolve(__dirname, '../src/shared/branding');
const BOOT_FILES = ['loaders.css', 'canvases.css', 'loaders.json'].map((name) => path.join(BRANDING, name));

// The start screen has to paint before any script runs, so its CSS and markup are written into index.html
function injectBoot(html) {
  const css = fs.readFileSync(path.join(BRANDING, 'loaders.css'), 'utf8').trim();
  const canvases = fs.readFileSync(path.join(BRANDING, 'canvases.css'), 'utf8').trim();
  const markup = JSON.stringify(JSON.parse(fs.readFileSync(path.join(BRANDING, 'loaders.json'), 'utf8')).odysee);
  return html.replace('<!--LOADER_CSS-->', () => css).replace('<!--CANVAS_CSS-->', () => canvases).replace('<!--LOADER_MARKUP-->', () => markup);
}

module.exports = { injectBoot, BOOT_FILES };
