set shell := ["bash", "-euo", "pipefail", "-c"]

compose := "docker compose -f docker/docker-compose.yaml -f docker/docker-compose.test.yaml --profile test"
demo_dir := "target/demo"

lint:
    cargo fmt --check
    cargo run --release --quiet -p game --bin lint
    cargo clippy --release --all-targets -- -D warnings
    cargo clippy --release -p game --lib --bin client --target wasm32-unknown-unknown -- -D warnings

test:
    cargo test --release -p game -p ui -p editor

# The website and game server binaries, and the roles the auth stack syncs from.
build: roles
    cargo build --release -p website -p game --bin website --bin game-server

# The browser client bundle the website serves; content syncs from the game server at boot.
wasm:
    cargo build --release -p game --bin client --target wasm32-unknown-unknown
    wasm-bindgen --target web --no-typescript --out-name rift --out-dir target/wasm target/wasm32-unknown-unknown/release/client.wasm

# Builds the editor and the two game binaries it starts, then opens the editor on FOLDER.
editor folder="content":
    cargo build --release -p editor -p game --bin editor --bin game-server --bin desktop-client
    target/release/editor {{quote(folder)}}

# The archive a release ships: the three binaries and the example content, for the running platform.
archive out="target/archive":
    cargo build --release -p editor -p game --bin editor --bin game-server --bin desktop-client
    rm -rf {{quote(out)}} && mkdir -p {{quote(out)}}
    cp target/release/{editor,game-server,desktop-client}{{ if os_family() == "windows" { ".exe" } else { "" } }} {{quote(out)}}
    cp -r content {{quote(out / "content")}}

# The local stack, with its observability services.
stack: build wasm (up "--profile dev")

# The stack, rebuilding the wasm and the website on every change: reload the page to pick one up.
dev: stack
    source docker/.env.test && echo "sign in and play at https://$RIFT_DOMAIN/play"
    cargo watch -w game -w ui -w bevy -s 'just wasm && {{compose}} up -d --build --wait rift-website'

# Tears the stack down and wipes its data, so keycloak imports its realm again on the next start.
reset:
    {{compose}} down -v

logs:
    {{compose}} logs --no-color

kc-provision: roles
    {{compose}} up -d --build keycloak

# No service names: compose's build sections are the single source of truth for what we publish.
[doc("Builds and pushes the production images.")]
push-images:
    docker compose -f docker/docker-compose.yaml --profile prod build
    docker compose -f docker/docker-compose.yaml --profile prod push

# Builds, brings up the stack and runs the Playwright suite (e2e/). FILTER limits which tests run.
e2e filter="": build wasm e2e-stack-up (e2e-run filter)

# The stack without its observability services, which the e2e doesn't exercise and which start slowest.
e2e-stack-up: (up "")

# LP_NUM_THREADS bounds each headed browser's Mesa threads so parallel workers don't thrash.
[doc("The Playwright suite against a running stack, on a virtual display.")]
e2e-run filter="":
    LP_NUM_THREADS=2 xvfb-run -a just playwright {{filter}}

# Records demo chapters (e2e/demos/) against a fresh stack to target/demo/<chapter>.webm: `just demo combat`.
demo filter="": build wasm e2e-stack-up (demo-run filter)

demo-run filter="":
    RIFT_DEMO_DIR=$PWD/{{demo_dir}} just playwright -c demo.config.ts {{filter}}

# Every chapter in file-name order, stitched into one video of the whole game.
showcase: build wasm e2e-stack-up
    rm -f {{demo_dir}}/[0-9]*.webm
    just demo-run
    ffmpeg -v error -y -f concat -safe 0 -i <(printf "file '$PWD/%s'\n" {{demo_dir}}/[0-9]*.webm) -c copy {{demo_dir}}/showcase.webm
    @echo {{demo_dir}}/showcase.webm

# Records the ui gallery on SCENE (a tab name): `just gallery-demo "toasts (sonner)" 8 "mousemove 800 523 click 1"`.
gallery-demo scene seconds="6" input="":
    cargo build --release -p ui --bin gallery
    scripts/record.sh {{quote(demo_dir / "gallery-" + kebabcase(scene) + ".webm")}} "rift ui gallery" {{seconds}} {{quote(input)}} "" \
      target/release/gallery {{quote(scene)}}

# The art exports sit beside the copy, so import scenes find them.
[doc("Records the editor on a copy of the example content at SCENE; HOOK runs with WORK naming the copy's parent.")]
editor-demo scene seconds="8" input="" hook="":
    #!/usr/bin/env bash
    set -euo pipefail
    cargo build --release -p editor
    export WORK=$(mktemp -d)
    trap 'rm -rf "$WORK"' EXIT
    cp -r content "$WORK/game"
    cp -r art "$WORK/art"
    scripts/record.sh {{quote(demo_dir / "editor-" + kebabcase(scene) + ".webm")}} "Rift editor" {{seconds}} {{quote(input)}} {{quote(hook)}} \
      target/release/editor "$WORK/game" --scene {{quote(scene)}} --user-folder "$WORK/user"

# Frames sampled evenly across VIDEO, tiled into one image beside it: a recording at a glance.
contact-sheet video:
    ffmpeg -v error -y -i {{quote(video)}} -frames:v 1 \
      -vf "fps=16/$(ffprobe -v error -show_entries format=duration -of csv=p=0 {{quote(video)}}),scale=640:-1,tile=4x4:padding=4" \
      {{quote(without_extension(video) + ".png")}}

# Empty NAMES or ANIMATIONS mean all.
[doc("Films actors in all eight directions through the game's sprite renderer: `just render-actor adventurer,dire-wolf walk,attack 2`.")]
render-actor names="" animations="" loops="4":
    RIFT_RENDER_CONTENT_DIR=content cargo run --quiet -p game --bin render-actor -- {{quote(names)}} {{quote(animations)}} {{loops}} \
      target/render/actor-{{ if names == "" { "all" } else { replace(names, ",", "+") } }}-{{ if animations == "" { "all" } else { replace(animations, ",", "+") } }}-x{{loops}}.mp4

# Synthesizes the generated sound effects into content/assets/audio.
synth-sfx:
    scripts/synth-sfx.sh

# Players are congested (all on the spawn tile, one shared view) by default; `dist` spreads them for distinct views.
[doc("The highest area count sustained within the tick budget.")]
bench mode="":
    RIFT_BENCH_CONTENT_DIR=content cargo run --release -p game --bin bench -- {{mode}}

loadtest count="dyn":
    RIFT_LOADTEST_HTTP_URL=http://127.0.0.1:9998 RIFT_LOADTEST_WS_URL=ws://127.0.0.1:9999 \
      cargo run --release -p game --bin loadtest -- {{count}}

loadtest-stack-up: (up "-f docker/docker-compose.loadtest.yaml")

[private]
roles:
    cargo run --release -p game --bin kc-roles > docker/keycloak/roles.conf

# The stack's game server reads a copy of the content folder, so a demo chapter can change it and
# restart the server to show a content deploy.
[private]
up flags:
    rm -rf target/stack/content && mkdir -p target/stack && cp -r content target/stack/content
    docker network inspect rift >/dev/null 2>&1 || docker network create rift
    {{compose}} {{flags}} up -d --build --wait

[private]
playwright *args:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a; source docker/.env.test; set +a
    cd e2e
    [ -d node_modules ] || npm ci
    npx playwright test {{args}}
