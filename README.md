# RushHour

[![CI](https://github.com/vasile-lazar/RushHour/actions/workflows/ci.yml/badge.svg)](https://github.com/vasile-lazar/RushHour/actions/workflows/ci.yml)
<p align="center">
  <img src="https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/OpenStreetMap-Road%20Data-7EBC6F?logo=openstreetmap&logoColor=white" alt="OpenStreetMap" />
  <img src="https://img.shields.io/badge/Canvas-Web%20Workers-E34F26" alt="Canvas and Web Workers" />
</p>

<p align="center">
  <img src="docs/demo.gif" alt="RushHour simulating traffic in a city" width="900" />
</p>

<!-- TODO: record a short GIF of the simulation running and save it as docs/demo.gif -->

**RushHour** is a desktop traffic simulator for any city in the world. Type a city name, and RushHour downloads its real road network from OpenStreetMap, fills it with vehicles, and simulates traffic on it — including congestion, aggressive drivers, and crashes. When the run is over, it reports which intersections caused the most trouble.

## What The Project Includes

- **Data layer (`data/`)** — geocodes a city name, downloads its roads from Overpass, and builds a directed road graph in meters with speed limits, lanes, one-way rules, and traffic signals. Runs in the Electron main process.
- **Simulation core (`core/`)** — pure TypeScript with no Electron or DOM dependency: graph types, geometry helpers, vehicles, routing, and car-following. Fully unit-tested in isolation.
- **Renderer (`renderer/`)** — canvas map with pan and zoom, playback controls, and the simulation worker client.
- **Electron shell (`main/`, `preload/`)** — window management and a sandboxed bridge between the main process and the UI.

## Core Capabilities

The target feature set for v1.0:

- Load any city by name — no manual data files needed.
- Realistic movement on the real road network: speed limits, lanes, one-way streets, and traffic signals.
- Adjustable share of aggressive drivers, with their own following distance and acceleration.
- Crash detection, where a crashed vehicle blocks its lane and causes secondary congestion.
- A problematic-intersections report ranking junctions by crashes, hard braking, delay, and queue length.
- Cities are cached on disk, so a city is only downloaded once.
- Installers for Windows, macOS, and Linux, published on GitHub Releases.

## Tech Stack

- Desktop shell: Electron
- Language: TypeScript
- Build tooling: electron-vite, Vite
- Rendering: HTML canvas
- Concurrency: Web Workers
- Map data: OpenStreetMap via Nominatim and Overpass
- Testing: Vitest

## Install

Download the installer for your system from the [Releases](https://github.com/vasile-lazar/RushHour/releases) page.

| System | File | Notes |
|---|---|---|
| Windows | `RushHour-x.y.z-win-setup.exe` | Windows may show an "unknown publisher" warning. Choose *More info*, then *Run anyway* |
| macOS (Apple Silicon) | `RushHour-x.y.z-mac.dmg` | The app is not signed. If macOS says it is damaged, run `xattr -cr /Applications/RushHour.app` once |
| Linux | `RushHour-x.y.z-linux.AppImage` | Make it executable (`chmod +x`), then run it |

The installers are not code-signed, since that requires paid certificates.

## Quick Start

### Prerequisites

- Node.js 20+
- An internet connection the first time a city is loaded

### Run In Development

```bash
git clone https://github.com/vasile-lazar/RushHour.git
cd RushHour
npm install
npm run dev
```

### Other Commands

```bash
npm test             # run the unit tests
npm run typecheck    # TypeScript check without emitting files
npm run build        # production build into out/
```

## Repository Layout

```text
RushHour/
├── src/
│   ├── core/        # pure TypeScript: graph types, geometry, simulation, analysis
│   ├── data/        # map acquisition: geocoding, Overpass, graph building, caching
│   ├── main/        # Electron main process: window, IPC handlers
│   ├── preload/     # sandboxed bridge between main and renderer
│   ├── renderer/    # UI, canvas map view, simulation worker
│   └── shared/      # types and constants used by more than one layer
├── docs/            # demo GIF and documentation assets
└── electron.vite.config.ts
```

## Data Pipeline

1. The user types a city name.
2. Nominatim resolves it to an OpenStreetMap area (the city boundary).
3. Overpass returns every drivable road in that area, along with the nodes they pass through.
4. The graph builder projects coordinates into meters, cuts each road at every junction and traffic signal, and emits one directed edge per direction of travel.
5. The resulting `RoadGraph` is sent to the renderer, which draws it and hands it to the simulation worker.
6. The worker advances the simulation and streams vehicle positions to the canvas.

## Data And Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License. RushHour uses the public Nominatim and Overpass services, so loaded cities are cached locally to keep requests to a minimum.

## License

Released under the [MIT License](LICENSE).
