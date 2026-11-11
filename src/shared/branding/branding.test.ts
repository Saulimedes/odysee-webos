import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { LOADER_STYLES } from '@/shared/config';
import { cssRules } from '../../../tests/helpers';
import { LOADER_MARKUP } from '.';

const root = path.resolve(__dirname, '../../..');
const { injectBoot, BOOT_FILES } = createRequire(import.meta.url)(path.join(root, 'tools/index-html.js')) as {
  injectBoot: (html: string) => string;
  BOOT_FILES: string[];
};
const source = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

describe('loaders', () => {
  it('have markup and a name for every loading animation, and the startup wheel has markup but is not offered', () => {
    expect(Object.keys(LOADER_MARKUP).sort()).toEqual([...LOADER_STYLES.map((style) => style.code), 'odysee'].sort());
    expect(LOADER_STYLES.map((style) => style.code)).not.toContain('odysee');
    expect(LOADER_STYLES[0].code).toBe('ring');
  });

  it('draw the Odysee wheel with twelve bars and a trail behind the leading one', () => {
    const wheel = LOADER_MARKUP.odysee;
    expect(wheel.match(/<path/g)).toHaveLength(12);
    ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].forEach((name) => expect(wheel).toContain(`class="${name}"`));
    expect(wheel).toContain('class="logo"');
  });

  it('are styled for every animation', () => {
    const css = fs.readFileSync(path.join(root, 'src/shared/branding/loaders.css'), 'utf8');
    LOADER_STYLES.forEach((style) => expect(css).toContain(`.loader-${style.code}`));
    expect(css).toContain('.loader-odysee');
    expect(css).toContain('steps(12)');
  });
});

describe('start animation figurine', () => {
  const css = fs.readFileSync(path.join(root, 'src/shared/branding/loaders.css'), 'utf8');
  const loaders = ['odysee'];
  const lightThemes = ['light', 'lighttinted'];

  it('is the astronaut alone, with no coloured tile or rounded corners behind it', () => {
    loaders.forEach((loader) => {
      const rules = cssRules(css, `.loader-${loader} .logo`);
      expect(rules.length).toBeGreaterThan(0);
      rules.forEach((rule) => {
        expect(Object.keys(rule).filter((property) => /^(background|border-radius)/.test(property))).toEqual([]);
      });
    });
    expect(css).not.toContain('data-contrast');
  });

  it('lets the image fill the box and keeps it white on the dark themes', () => {
    loaders.forEach((loader) => {
      const rules = cssRules(css, `.loader-${loader} .logo img`);
      expect(rules).toHaveLength(1);
      expect(rules[0].width).toBe('100%');
      expect(rules[0].height).toBe('100%');
      expect(rules[0].filter).toBeUndefined();
    });
  });

  it('turns the figurine dark on the light themes', () => {
    loaders.forEach((loader) => lightThemes.forEach((theme) => {
      const rules = cssRules(css, `[data-theme='${theme}'] .loader-${loader} .logo img`);
      expect(rules).toHaveLength(1);
      expect(rules[0].filter).toBe('brightness(0)');
    }));
  });

  it('is drawn as a logo image inside the wheel', () => {
    loaders.forEach((loader) => expect(LOADER_MARKUP[loader as 'odysee']).toContain('<i class="logo"><img src="odysee-logo.png"'));
  });

  it('is part of the start screen only, none of the loading animations to choose from has it', () => {
    LOADER_STYLES.forEach((style) => {
      expect(LOADER_MARKUP[style.code as keyof typeof LOADER_MARKUP]).not.toContain('odysee-logo');
      expect(LOADER_MARKUP[style.code as keyof typeof LOADER_MARKUP]).not.toContain('<svg');
    });
    expect(LOADER_STYLES.map((style) => style.name)).not.toContain('Odysee Pulse');
    expect(Object.keys(LOADER_MARKUP)).not.toContain('pulse');
    expect(fs.readFileSync(path.join(root, 'src/shared/branding/loaders.css'), 'utf8')).not.toMatch(/pulse|halo|breathe/);
  });
});

describe('loading animation previews on the picked row', () => {
  const styles = fs.readFileSync(path.join(root, 'src/app/styles/styles.css'), 'utf8');
  const loaders = fs.readFileSync(path.join(root, 'src/shared/branding/loaders.css'), 'utf8');

  it('are drawn in the readable color, since the row is filled with the accent that they are drawn in otherwise', () => {
    expect(cssRules(styles, '.pickerItem--active')[0].background).toBe('var(--accent)');
    const rules = cssRules(styles, '.pickerItem--active .loaderPreview');
    expect(rules).toHaveLength(1);
    expect(rules[0]['--accent']).toBe('var(--accent-contrast)');
    expect(rules[0]['--accent-rgb']).toBe('var(--accent-contrast-rgb)');
    expect(rules[0]['--text']).toMatch(/^rgba\(var\(--accent-contrast-rgb\), 0\.\d+\)$/);
  });

  it('can be recolored because every animation takes its colors from the variables that the row replaces', () => {
    expect(loaders).not.toMatch(/#de0050/i);
    LOADER_STYLES.forEach((style) => {
      const rules = loaders.split('}').filter((rule) => rule.includes(`.loader-${style.code}`) && !/--s:|@keyframes/.test(rule.split('{')[0]));
      expect(rules.join('}')).toMatch(/var\(--accent\)/);
      expect(rules.join('}')).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    });
  });
});

describe('start screen', () => {
  it('is written into index.html with its css and markup', () => {
    const html = injectBoot(source);
    expect(html).not.toMatch(/<!--(LOADER_CSS|CANVAS_CSS|LOADER_MARKUP)-->/);
    expect(html).toContain('.loader-odysee');
    expect(JSON.parse(/innerHTML = ("(?:[^"\\]|\\.)*");/.exec(html)![1])).toBe(LOADER_MARKUP.odysee);
    BOOT_FILES.forEach((file) => expect(fs.existsSync(file)).toBe(true));
  });

  it('keeps index.html small so the first frame is not held up', () => {
    expect(injectBoot(source).length).toBeLessThan(14000);
    expect(injectBoot(source)).not.toContain('base64');
  });

  it('uses a plain image for the logo, which every webOS version can draw from a local file', () => {
    expect(LOADER_MARKUP.odysee).toContain('<img src="odysee-logo.png"');
    expect(fs.readFileSync(path.join(root, 'webpack.config.js'), 'utf8')).toContain("from: 'odysee-logo.png'");
    expect(fs.readFileSync(path.join(root, 'src/shared/branding/loaders.css'), 'utf8')).not.toContain('mask');
  });

  it('is always the Odysee wheel, whatever loading animation was chosen, and follows the theme', () => {
    expect(source).not.toContain('data-loader');
    expect(source).toContain('class="loading-spinner loader-odysee"');
    expect(source).toContain('var(--bg)');
    expect(source).toContain('appearance_boot');
  });

  it('starts the bundles once the page has loaded, without preload hints that fetched them twice', () => {
    expect(source).toContain("document.readyState === 'complete'");
    expect(source).toContain("addEventListener('load', loadBundles)");
    expect(source).not.toContain('rel="preload"');
  });

  it('keeps the logo small', () => {
    expect(fs.statSync(path.join(root, 'src/shared/branding/odysee-logo.png')).size).toBeLessThan(20000);
  });
});

describe('Ambient Glow theme', () => {
  const canvas = fs.readFileSync(path.join(root, 'src/shared/branding/canvases.css'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src/app/styles/styles.css'), 'utf8');

  it('draws two glows in the accent color in opposite corners', () => {
    const rules = cssRules(canvas, "html[data-theme='ambient']");
    expect(rules).toHaveLength(1);
    const glow = rules[0]['--canvas'];
    expect(glow.match(/radial-gradient/g)).toHaveLength(2);
    expect(glow).toContain('circle at 85% 15%');
    expect(glow).toContain('circle at 15% 85%');
    expect(glow.match(/rgba\(var\(--accent-rgb\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(glow).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('is written into the start screen, so the glow is there from the first frame', () => {
    const html = injectBoot(source);
    expect(html).toContain("html[data-theme='ambient'] {");
    expect(html).toContain("html[data-theme='ambient'] #boot { background: var(--canvas), var(--bg); }");
    expect(BOOT_FILES.map((file) => path.basename(file))).toContain('canvases.css');
  });

  it('shows through the app shell and the closed sidebar, while other themes have no canvas', () => {
    const shell = cssRules(styles, '.appShell');
    expect(shell).toHaveLength(1);
    expect(shell[0].background).toBe('var(--canvas, none), var(--bg)');
    const bar = cssRules(styles, "html[data-theme='ambient'] .sidebar:not(.sidebar--open)");
    expect(bar).toHaveLength(1);
    expect(bar[0].background).toBe('transparent');
    expect(cssRules(canvas, "html[data-theme='black']")).toEqual([]);
  });
});

describe('new loading animations', () => {
  const css = fs.readFileSync(path.join(root, 'src/shared/branding/loaders.css'), 'utf8');
  const only = (selector: string) => {
    const rules = cssRules(css, selector);
    expect(rules).toHaveLength(1);
    return rules[0];
  };

  it('are offered next to the others and have markup, which is empty because CSS draws them', () => {
    expect(LOADER_STYLES.map((style) => style.code)).toEqual(['ring', 'dots', 'arcs', 'typing', 'bounce', 'ripple']);
    expect(LOADER_STYLES.slice(2, 6).map((style) => style.name)).toEqual(['Twin Arcs', 'Growing Dots', 'Bouncing Dots', 'Ripple']);
    expect(LOADER_MARKUP.arcs).toBe('');
    expect(LOADER_MARKUP.typing).toBe('');
    expect(LOADER_MARKUP.bounce).toBe('<i></i><i></i><i></i>');
    expect(LOADER_MARKUP.ripple).toBe('<i></i><i></i><i></i><b></b>');
  });

  it('turn two arcs in the accent color half way round', () => {
    const arcs = only('.loader-arcs');
    expect(arcs['border-radius']).toBe('50%');
    expect(arcs['border-top-color']).toBe('var(--accent)');
    expect(arcs['border-bottom-color']).toBe('var(--accent)');
    expect(arcs['border-left-color']).toBeUndefined();
    expect(arcs.animation).toBe('loader-half 1s infinite');
    expect(css).toMatch(/@keyframes loader-half \{ to \{ transform: rotate\(180deg\); \} \}/);
  });

  it('show three dots in the accent color that appear one by one', () => {
    const dots = only('.loader-typing');
    expect(dots.background).toContain('radial-gradient(circle closest-side, var(--accent) 90%, transparent)');
    expect(dots.background).toContain('calc(100% / 3) 100% space');
    expect(dots['clip-path']).toBe('inset(0 100% 0 0)');
    expect(dots.animation).toBe('loader-typing 1s steps(4) infinite');
    expect(css).toMatch(/@keyframes loader-typing \{ to \{ clip-path: inset\(0 -34% 0 0\); \} \}/);
    expect(dots['--w']).toBe('calc(var(--s) * 1.2)');
    expect(dots['--h']).toBe('calc(var(--s) * 0.3)');
  });

  it('hop three accent dots one after the other', () => {
    const dots = cssRules(css, '.loader-bounce i');
    expect(dots).toHaveLength(1);
    expect(dots[0].background).toBe('var(--accent)');
    expect(dots[0].animation).toBe('loader-hop 0.9s ease-in-out infinite');
    expect(cssRules(css, '.loader-bounce i:nth-child(2)')[0]['animation-delay']).toBe('0.15s');
    expect(cssRules(css, '.loader-bounce i:nth-child(3)')[0]['animation-delay']).toBe('0.3s');
    expect(css).toMatch(/@keyframes loader-hop \{ 0%, 60%, 100% \{ transform: translateY\(0\); \} 30% \{ transform: translateY\(calc\(var\(--s\) \* -0\.45\)\); \} \}/);
  });

  it('send three filled accent rings out from a dot in the middle, one third of a turn apart in time', () => {
    const ring = cssRules(css, '.loader-ripple i');
    expect(ring).toHaveLength(1);
    expect(ring[0]['border-radius']).toBe('50%');
    expect(ring[0].border).toBe('calc(var(--s) * 0.09) solid var(--accent)');
    expect(ring[0].background).toBe('rgba(var(--accent-rgb, 222, 0, 80), 0.16)');
    expect(ring[0].animation).toBe('loader-ripple 2.1s cubic-bezier(0.15, 0.5, 0.35, 1) infinite');
    expect(cssRules(css, '.loader-ripple i:nth-child(2)')[0]['animation-delay']).toBe('-0.7s');
    expect(cssRules(css, '.loader-ripple i:nth-child(3)')[0]['animation-delay']).toBe('-1.4s');
    expect(css).toMatch(/@keyframes loader-ripple \{ 0% \{ transform: scale\(0\.28\); opacity: 1; \} 55% \{ opacity: 0\.7; \} 100% \{ transform: scale\(1\); opacity: 0; \} \}/);
  });

  it('keep a solid accent dot in the middle of the ripple that beats with every ring', () => {
    const dot = cssRules(css, '.loader-ripple b');
    expect(dot).toHaveLength(1);
    expect(dot[0].background).toBe('var(--accent)');
    expect(dot[0]['border-radius']).toBe('50%');
    expect(dot[0].animation).toBe('loader-drop 2.1s ease-in-out infinite');
    expect(cssRules(css, '.loader-ripple')[0]['--s']).toBe('calc(88px * var(--boot-scale, 1))');
  });

  it('use nothing Chrome 68 cannot draw', () => {
    expect(css).not.toContain('aspect-ratio');
    expect(css).not.toMatch(/\d+(\.\d+)?turn/);
  });
});

describe('Ambient Glow surfaces', () => {
  const styles = fs.readFileSync(path.join(root, 'src/app/styles/styles.css'), 'utf8');

  it('shows a solid menu and picker over the see-through surfaces', () => {
    const panel = cssRules(styles, '.picker__panel');
    expect(panel).toHaveLength(1);
    expect(panel[0].background).toBe('var(--panel)');
    const open = cssRules(styles, '.sidebar--open');
    expect(open[0].background).toBe('var(--panel-alt)');
    const ambient = cssRules(styles, "html[data-theme='ambient'] .sidebar--open");
    expect(ambient).toHaveLength(1);
    expect(ambient[0].background).toContain('linear-gradient(135deg, rgba(var(--accent-rgb), 0)');
    expect(ambient[0].background).toContain('var(--panel-alt)');
  });
});
