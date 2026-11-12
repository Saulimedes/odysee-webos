# Odysee for webOS

[![CI](https://github.com/Saulimedes/odysee-webos/actions/workflows/main.yml/badge.svg)](https://github.com/Saulimedes/odysee-webos/actions/workflows/main.yml)
[![Release](https://github.com/Saulimedes/odysee-webos/actions/workflows/release.yml/badge.svg)](https://github.com/Saulimedes/odysee-webos/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

Unofficial Odysee client for LG webOS TVs.

![Home screen](.github/screenshots/screenshot1.png)

![Player screen](.github/screenshots/screenshot2.png)

## Features

- Home like on Odysee, with Continue Watching and a row per category.
- Search, Categories, channels, Library, Playlists and Following. Sign in to sync Watch Later, Favorites and Following.
- Hold OK on a video to save it, remove it or open its channel.
- Player with aspect ratio, speed, Stats for Nerds and autoplay of the next video.
- Themes, fonts and sizes, a customizable homepage and menu, 9 languages.
- Made for the TV remote, the Magic Remote pointer works too.

## Installation

Needs webOS 5 or newer.

- **[Device Manager](https://github.com/webosbrew/dev-manager-desktop):** Install the `.ipk` from the [Releases](https://github.com/Saulimedes/odysee-webos/releases) page.
- **Command line:** Build and deploy it yourself, see [Deploy to the TV](#deploy-to-the-tv).

## Development

Node 24 is used for everything except packaging (see `.nvmrc`).

```bash
npm ci
npm start          # dev server on http://localhost:3333
npm run verify     # typecheck, FSD lint, unused code, tests, build and Chrome 68
```

The dev server also loads hls.js, so browsers without HLS of their own (Firefox) play the transcoded streams. Chrome, Safari and the TV play them natively and the production build does not contain hls.js.

### Deploy to the TV

Turn on Developer Mode on the TV and add it once, see the [webOS Brew setup guide](https://www.webosbrew.org/develop/guides/env-setup) for the key and passphrase:

```bash
npx ares-setup-device --add tv -i "host=<TV_IP>" -i "port=9922" -i "username=prisoner" -i "default=true"
```

Then build, install and start the app:

```bash
npm run build
npm run package    # creates org.webosbrew.odysee_<version>_all.ipk
npm run deploy     # installs it on the default device
npm run launch
```

`npm run package` runs `ares-package` on Node 20, because newer Node writes every file with timestamp 0 and webOS then refuses the ipk.

## Credits

- Uses the [LBRY](https://lbry.com) and [Odysee](https://odysee.com) APIs.
- Customization, the webOS aspect ratio and playback speed services, and tooling follow [cccbib](https://github.com/volkovmqx/cccbib).
- Built with React and Tabler icons. Fonts are under the SIL Open Font License, see `src/app/styles/fonts`.
- The Odysee name and the Odysee astronaut logo belong to their owners. This is an unofficial app and is not affiliated with Odysee. For the rights to the logo, see [Odysee Logo on Wikipedia](https://de.wikipedia.org/wiki/Datei:Odysee_Logo.svg).

## License

[GPL-3.0](LICENSE)
