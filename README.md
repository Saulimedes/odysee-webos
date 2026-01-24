# Odysee for WebOS

Unofficial Odysee/LBRY client for LG WebOS TVs.

## Features

- Browse trending videos on Odysee
- Category browsing: Cheese, Big Hits, Gaming, Lab, Tech, News, Finance, Universe
- Search videos and channels
- Watchlist to save videos for later
- Full video playback with TV remote controls

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- WebOS SDK (ares-cli) for deployment

### Setup

```bash
npm install
```

### Run Development Server

```bash
npm start
```

Opens at http://localhost:3333

### Build for Production

```bash
npm run build
```

### Deploy to TV

1. Enable Developer Mode on your LG TV
2. Set up device with ares-cli:
   ```bash
   ares-setup-device
   ```
3. Package and deploy:
   ```bash
   npm run build
   npm run package
   npm run deploy
   npm run launch
   ```

## Remote Control

| Button | Action |
|--------|--------|
| Arrow Keys | Navigate |
| Enter/OK | Select |
| Back | Go back / Exit player |
| Left/Right (in player) | Seek 10 seconds |
| Up/Down (in player) | Volume |

## Project Structure

```
src/
├── index.jsx          # App entry point
├── App.jsx            # Router
├── constants.js       # Config and keycodes
├── styles.css         # TV-optimized styles
├── api/
│   └── odysee.js      # LBRY API client
├── views/
│   └── Main.jsx       # Main layout
└── components/
    ├── Sidebar.jsx    # Navigation menu
    ├── Home.jsx       # Home view
    ├── Search.jsx     # Search view
    ├── Player.jsx     # Video player
    └── ...
```

## Credits

- Uses the [LBRY](https://lbry.com) / [Odysee](https://odysee.com) API
- Based on patterns from [cccbib](https://github.com/nickersk/cccbib)
- Built with React, Mantine, and Embla Carousel

## License

GPL-3.0
