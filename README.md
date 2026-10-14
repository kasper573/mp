# rift

An online RPG built in rust.

## Development

One-time setup:

- [Docker](https://www.docker.com/) — runs the local stack (auth, website, game server,
  observability, HTTPS proxy)
- [Rust](https://rustup.rs/) — rustup installs the repo's pinned toolchain on first build
- `wasm-bindgen-cli` for building the wasm client:
  `cargo install wasm-bindgen-cli --locked`
- `cargo-watch` for the dev loop: `cargo install cargo-watch --locked`
- To run the gameplay tests (`just test`) and record the showcase (`just showcase`): `weston`,
  `xwayland`, `xdotool`, [ffmpeg](https://ffmpeg.org/) built with libass, and a PulseAudio server
  (PipeWire's will do) with its `pactl` and `parecord`. A GPU keeps them fast; without one they render
  in software. See [Tests](#tests).
- To run the browser suite (`just e2e`): [Node.js](https://nodejs.org/), Google Chrome and `xvfb`. It
  is [Playwright](https://playwright.dev) (in [`e2e/`](e2e)); `just e2e` installs its npm deps on
  first run and drives Chrome on a virtual display, so it's zero-config and never touches your
  desktop. CI fans out across Chrome, Firefox and Safari.
- The ui gallery and editor recordings need `xvfb`, `xdotool` and ffmpeg.

Then:

```sh
just dev
```

This deploys the stack (website serving the baked wasm) and rebuilds the wasm on change. There is
no wasm hot reload: sign in at the printed URL and reload the page to pick up rebuilds.
`just stack` deploys the stack alone; `just reset` tears it down and wipes its data.

To see the game in action without playing it, record its showcase chapters
([`showcase/src/chapters/`](showcase/src/chapters)):

```sh
just showcase combat travel   # some chapters: target/showcase/03-combat.mp4, target/showcase/06-travel.mp4
just showcase                 # all of them, stitched: target/showcase/showcase.mp4
just gallery-showcase "toasts (sonner)" 8 "mousemove 800 523 click 1"   # a ui component on its own
```

The website lives at <https://rift.localhost> and Grafana at <https://grafana.rift.localhost>.

## Tests

`just test` runs every crate's tests. The gameplay tests among them
([`game/tests/gameplay/`](game/tests/gameplay)) play the game for real, through the same
[`driver`](driver) the showcase plays through: each runs a game server and desktop clients natively,
every client on a virtual display with a sound server sink of its own, played with mouse and keyboard
through the game's own input bindings and recorded, picture and sound. Clients draw as fast as the
machine lets them, and waits count the game's frames as well as time, so a slow machine plays slower
rather than failing. A failed test keeps its
recording, logs, input steps and last snapshot in `target/tmp/gameplay/`, and CI uploads them.

`just e2e` is the browser suite, run against the docker stack: the website and the game as a browser
gets them. Gameplay has a single smoke test there, a new player signing up and appearing in the game
at the spawn location (compared against the reference image beside it in [`e2e/tests/`](e2e/tests)); the rest
of gameplay is the gameplay tests' job.

## Content

The game is a content folder: [`content/`](content) holds `game.json`, one JSON row per file under
`tables/<table>/`, and `assets/`. The server loads it at start and serves it; clients sync it and keep
it on the device; the same binaries run any folder that fits their build.

```sh
just editor               # build editor, game-server and desktop-client, open the editor on content/
just editor ~/my-game     # …or on another folder
just archive              # the release: the three binaries and the example content, in target/archive
```

The editor edits the folder in place, with undo across every row, and plays it through the two game
binaries it finds beside itself (or in the folder its settings name). New games start from the
templates built into the editor. Art comes in through the import dialogs: drop an Aseprite or
TexturePacker export, a sheet, a numbered sequence, a GIF or an APNG onto a model or a tileset, and
the editor maps it onto the row, keeps the cues and tile data that still fit, and watches the file
for changes.

A content deploy needs no client build: the server restarts on the new folder, and players reconnect,
sync the changed files and rejoin. Production mounts its own folder over the image's example.

## Release and deploy

Pushing to `main` builds the wasm client and stack images, and deploys them to production. The
website serves the wasm at `/play`; the game server serves the content folder, which the client
syncs at boot and keeps on the device. The same push builds the archive for Linux, Windows and macOS
(`just archive` on each) and attaches it to the workflow run.
