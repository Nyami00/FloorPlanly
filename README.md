# FloorPlanly

A browser-based floor plan editor built with React + Vite.

## Features

- Edit 1F / 2F plans independently.
- Add / delete rooms.
- Drag rooms, resize, and rotate.
- Add / delete doors.
- Switch door type, orientation, and width.
- Local autosave with `localStorage`.
- Export / import project JSON.

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages Deployment

This repository includes `.github/workflows/deploy.yml` for Pages deployment.

1. Push to `main`.
2. Open `Settings > Pages`.
3. Set `Build and deployment` to `GitHub Actions`.
4. After workflow success, open:
   `https://nyami00.github.io/FloorPlanly/`

## Data Format

Exported JSON:

```json
{
  "version": 1,
  "rooms": { "1": [], "2": [] },
  "doors": { "1": [], "2": [] }
}
```
