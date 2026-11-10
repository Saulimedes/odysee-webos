# Odysee for webOS

Unofficial Odysee client for LG webOS TVs.

## Features

- Home like on Odysee: your Following row on top when you are signed in, then Continue Watching, Featured and one row per Odysee category.
- Continue Watching: resumes where you stopped and shows your progress on every card.
- Discover, Featured, Categories, channel pages and search for videos and channels.
- Sign in with a magic link or a password. Following, Playlists, Watch Later and Favorites sync with your account.
- Library with Continue Watching, Watch Later, Favorites and Watch History.
- Player settings behind a gear on the right: aspect ratio (Auto, Zoom, Stretch), playback speed (0.5x to 2x), video quality and Stats for Nerds.
- The app comes in 9 languages: English, German, French, Spanish, Italian, Dutch, Portuguese, Polish and Czech. Home can use Odysee's own homepage for 9 languages.
- App customization: Black, Dark and Light themes with 24 accent colors (Odysee Pink by default), 14 fonts, corner style, text size and card size.
- Customize the Homepage and the Sidebar: show, hide and reorder rows and menu entries, and pick the icon style and size.
- The start screen is the Odysee astronaut inside a turning wheel that follows your theme and accent color. Pages that load show the Loading Animation you pick in Settings, the Ring by default.
- Made for the TV remote.

## Installation

You can install the app using one of the following methods:

- **[webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel):** Odysee is not in the official [webOS Brew repository](https://repo.webosbrew.org/) yet. Once it is listed, it will be available at `https://repo.webosbrew.org/apps/org.webosbrew.odysee/` and installs and updates from the Homebrew Channel on the TV.
- **[Device Manager](https://github.com/webosbrew/dev-manager-desktop):** Use the pre-built `.ipk` file from the [Releases](https://github.com/Saulimedes/odysee-webos/releases) page.
- **Command Line (webOS CLI):** Build it and install it yourself, see [Deploy to the TV](#deploy-to-the-tv).

The target is Chrome 68 (webOS 5). The production build uses ES2019 syntax or older, `npm run build` checks that, and `npm run test:chrome68` runs the app in a real Chrome 68.

## Remote control

| Button | Action |
| --- | --- |
| Arrow keys | Navigate |
| OK | Select |
| Back | Go back, closes the sidebar or the player controls first |
| Left on the first item | Open the sidebar |
| Left and Right in the player | Seek 10 seconds, steps grow while you keep pressing |
| Up and Down in the player | Move between the top bar, the timeline and the buttons |
| Play, Pause, Stop, Rewind and Fast Forward | Work in the player |

## Customization

Open Settings. It has a list of pages on the left (Appearance, Customize, Language, Playback, Account and About) and the settings of the selected page on the right. Right or OK opens a page, Left or Back returns to the list. The same list-and-details layout is used by Categories, Following and Playlists: while the focus is on the details, the list shrinks to its icons so the videos get the room. Theme, accent color and font apply while you move through the list in the picker and only stick once you confirm. The fonts ship with the app and load when you pick them.

- **Theme**: Black, Dark or Light, plus Tinted, Ambient Glow (two soft glows in your accent color) and Light Tinted variants that borrow your accent color. Odysee Pink is the default accent, the other colors are one pick away.
- **Customize Homepage**: OK shows or hides a row, Right picks a row up so Up and Down can move it, Back when you are done. "Reset to default" is the last entry. Rows are Continue Watching, Following and every Odysee category.
- **Customize Sidebar**: the same editor for the menu. Settings and Login always stay. Menu Icon Style (Outlined, Filled, Dynamic) and Menu Icon Size change how the icons look, the icons of the categories on Home, in Categories and in the editors follow the style too.
- **Loading Animation**: Ring (default), Dots, Twin Arcs, Growing Dots, Bouncing Dots, Ripple, Odysee Wheel or Odysee Pulse, shown whenever a page or the player is loading. The start screen is always the Odysee Wheel and uses the theme and accent color you picked last time.
- **Logo Button**: the Odysee logo at the top of the menu can be the button for Home or for Settings. It then replaces that entry, so it is never both.
- **Back Button**: shows or hides the back arrow at the top left of the player controls. The Back key of the remote always works.
- **Aspect ratio and Playback speed**: the defaults videos start with. Both can also be changed while playing, in the settings behind the gear on the right of the player.
- **App Language**: Auto follows the language of your TV. Czech and Polish get all their plural forms.
- **Homepage Language**: Odysee has its own homepage, with its own rows, for English, German, French, Spanish, Italian, Brazilian Portuguese, Russian, Chinese and Hindi. Same as app language is the default.
- **Stats for Nerds**: switch it on in Settings and the player settings get a Stats for Nerds entry. It shows the stream, file, resolution, dropped frames, buffer, connection and more, to find out why a video plays badly.
- **Customize Homepage** can also apply its order to the Categories page, like "Also apply to sidebar" on odysee.com.
- **Categories** lists every category of your homepage language, also the ones Odysee leaves out of its homepage rows by default, like News & Politics. Wild West (English homepage only) comes last: it has no list of channels, it is everything except the channels Odysee leaves out, one video per channel.
- **About** shows the version and the commit the app was built from.

Odysee has no subtitles and no extra audio tracks for videos (a video only carries the language it is in), so there is nothing to choose in the player.

The layout of Home and the Sidebar is stored on the TV only, it is not synced with your Odysee account.

### Languages

The text of the app is English in the code and every other language is a small file that loads when it is used. `npm run check:i18n` (also part of `npm run build`) fails when a language misses a string, changes a `{placeholder}` or has the wrong number of plural forms. Plural texts hold their forms in one string, like `{count} video|{count} videos` (two forms, four for Czech and Polish). To add a language, copy a file in `src/shared/i18n/locales`, list it in `translation.ts` and `UI_LANGUAGES`.

### Aspect ratio and speed on webOS

The video of an LG TV is drawn on its own layer, so the usual web tools do not work there. Zoom and Stretch on webOS 5 and older go through the TV's video output service, and playback speed through its media service, which keeps picture and sound in sync. Newer webOS versions and browsers use `object-fit` and `playbackRate`. If a TV refuses a speed, the player says so and goes back to 1x.

## Development

Node 24 is used for everything except packaging (see `.nvmrc`).

```bash
npm ci
npm start          # dev server on http://localhost:3333
npm run verify     # typecheck, FSD lint, unused code, tests with coverage, build and Chrome 68
```

### Deploy to the TV

1. Enable Developer Mode on the TV and add it with `ares-setup-device`.
2. Run:

```bash
npm run build
npm run package    # writes org.webosbrew.odysee_<version>_all.ipk
npm run deploy
npm run launch
```

`npm run package` always runs `ares-package` on Node 20. On Node 22 and newer it writes every file with timestamp 0 and webOS then refuses the ipk with "ipk verified failed". The script checks the result and fails with a message if that happens.

## Project structure

The code follows [Feature-Sliced Design](https://feature-sliced.design) (checked by `npm run lint:fsd`).

```
src/
├── app/        Entry, routing, account start up and global styles
├── pages/      Home, feed, categories, following, playlists, library, search, settings, login
├── widgets/    Sidebar, player, video rows, item grid, master detail
├── features/   Collections, continue watching, following, browse feeds, customize layout
├── entities/   Video, channel, category, session
└── shared/     API cache and client, config and appearance, start screen, webOS services, hooks, UI
```

Performance notes:

- Rows and grids draw only the cards near the screen.
- Home starts from cached rows and loads the others as you scroll toward them.
- Thumbnails come through the Odysee image resizer.
- One global key handler replaces a listener per screen.
- The player is loaded in the background after start, so it is not part of the start up path.
- The start screen is plain HTML and CSS inside `index.html`. It shows before any script runs and stays until Home has rows to show.

## Credits

- Uses the [LBRY](https://lbry.com) and [Odysee](https://odysee.com) APIs.
- Customization, the webOS aspect ratio and playback speed services, and tooling follow [cccbib](https://github.com/volkovmqx/cccbib).
- Built with React and Tabler icons. Fonts are under the SIL Open Font License, see `src/app/styles/fonts`.
- The Odysee name and the Odysee astronaut logo belong to their owners. This is an unofficial app and is not affiliated with Odysee. For the rights to the logo, see [Odysee Logo on Wikipedia](https://de.wikipedia.org/wiki/Datei:Odysee_Logo.svg).

## License

GPL-3.0
