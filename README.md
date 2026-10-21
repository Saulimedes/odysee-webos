# Odysee for webOS

Unofficial Odysee client for LG webOS TVs.

## Features

- Home with one row per Odysee category and a Following row when you are signed in.
- Continue Watching: resumes where you stopped and shows your progress on every card.
- Discover, Featured, Categories, channel pages and search for videos and channels.
- Sign in with a magic link or a password. Following, Playlists, Watch Later and Favorites sync with your account.
- Library with Continue Watching, Watch Later, Favorites and Watch History.
- App customization: themes, accent colors, 14 fonts, corner style, text size and card size.
- Made for the TV remote.

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

Open Settings. Theme, accent color and font apply while you move through the list in the picker and only stick once you confirm. The fonts ship with the app and load when you pick them.

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
├── features/   Collections, continue watching, following, browse feeds
├── entities/   Video, channel, category, session
└── shared/     API cache and client, config and appearance, hooks, UI
```

Performance notes:

- Rows and grids draw only the cards near the screen.
- Home starts from cached rows and loads the others as you scroll toward them.
- Thumbnails come through the Odysee image resizer.
- One global key handler replaces a listener per screen.

## Credits

- Uses the [LBRY](https://lbry.com) and [Odysee](https://odysee.com) APIs.
- Customization and tooling follow [cccbib](https://github.com/volkovmqx/cccbib).
- Built with React and Tabler icons. Fonts are under the SIL Open Font License, see `src/app/styles/fonts`.

## License

GPL-3.0
