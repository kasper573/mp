use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;

use askama::Template;
use axum::extract::State;
use axum::http::{StatusCode, header};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum_extra::extract::cookie::CookieJar;
use openidconnect::RedirectUrl;
use serde::Deserialize;
use tower_http::services::ServeDir;

mod auth;

service::heap_profiling!();

#[derive(Deserialize)]
struct Config {
    bind: IpAddr,
    port: u16,
    redirect_uri: RedirectUrl,
    game_server_url: String,
    game_server_ws_url: String,
    downloads_url: String,
    wasm_dir: PathBuf,
    pyroscope_enabled: bool,
    pyroscope_sample_hz: u32,
}

struct App {
    auth: auth::Auth,
    domain: String,
    game_server_url: String,
    game_server_ws_url: String,
    downloads_url: String,
}

#[tokio::main]
async fn main() {
    let config: Config = envy::prefixed("RIFT_WEBSITE_")
        .from_env()
        .expect("RIFT_WEBSITE_* environment");
    let _profiler = service::profiler(
        "rift-website",
        config.pyroscope_enabled,
        config.pyroscope_sample_hz,
    );
    let at = SocketAddr::new(config.bind, config.port);
    let domain = config
        .redirect_uri
        .url()
        .host_str()
        .expect("a redirect uri with a host")
        .to_owned();
    let app = Arc::new(App {
        auth: auth::Auth::from_env(config.redirect_uri).await,
        domain,
        game_server_url: config.game_server_url,
        game_server_ws_url: config.game_server_ws_url,
        downloads_url: config.downloads_url,
    });
    let router = axum::Router::new()
        .route("/", get(landing))
        .route("/play", get(play))
        .route("/downloads", get(downloads))
        .route("/auth/sign-in", get(auth::sign_in))
        .route("/auth/sign-out", get(auth::sign_out))
        .route("/auth-callback", get(auth::callback))
        .route("/site.css", get(css))
        .route("/favicon.png", get(favicon))
        .nest_service("/wasm", ServeDir::new(config.wasm_dir))
        .with_state(app);
    service::serve("website", at, router).await;
}

impl App {
    async fn nav(&self, jar: &CookieJar, path: &str) -> Nav {
        let identity = auth::identity(self, jar).await;
        Nav {
            user: identity.map(|identity| identity.name),
            account_url: self.auth.account_url(),
            path: path.to_owned(),
        }
    }
}

struct Nav {
    user: Option<String>,
    account_url: String,
    path: String,
}

#[derive(Template)]
#[template(path = "landing.html")]
struct Landing {
    nav: Nav,
}

async fn landing(State(app): State<Arc<App>>, jar: CookieJar) -> Response {
    page(Landing {
        nav: app.nav(&jar, "/").await,
    })
}

#[derive(Template)]
#[template(path = "play.html")]
struct Play {
    nav: Nav,
    access_token: Option<String>,
    game_server_url: String,
    game_server_ws_url: String,
}

async fn play(State(app): State<Arc<App>>, jar: CookieJar) -> Response {
    let nav = app.nav(&jar, "/play").await;
    let access_token = nav
        .user
        .as_ref()
        .and_then(|_| jar.get("token").map(|cookie| cookie.value().to_owned()));
    page(Play {
        nav,
        access_token,
        game_server_url: app.game_server_url.clone(),
        game_server_ws_url: app.game_server_ws_url.clone(),
    })
}

#[derive(Template)]
#[template(path = "downloads.html")]
struct Downloads {
    nav: Nav,
    platforms: Vec<PlatformDownloads>,
    domain: String,
}

struct PlatformDownloads {
    platform: &'static Platform,
    to_play: Vec<Download>,
    to_make: Vec<Download>,
}

struct Download {
    about: &'static str,
    name: String,
    url: String,
}

struct Platform {
    id: &'static str,
    name: &'static str,
    detail: &'static str,
    executable_suffix: &'static str,
}

struct File {
    name: &'static str,
    about: &'static str,
    executable: bool,
}

const PLATFORMS: [Platform; 3] = [
    Platform {
        id: "linux-x86_64",
        name: "Linux",
        detail: "x86-64",
        executable_suffix: "",
    },
    Platform {
        id: "windows-x86_64",
        name: "Windows",
        detail: "x86-64",
        executable_suffix: ".exe",
    },
    Platform {
        id: "macos-arm64",
        name: "macOS",
        detail: "Apple silicon",
        executable_suffix: "",
    },
];

const TO_PLAY: [File; 2] = [
    File {
        name: "desktop-client",
        about: "The game.",
        executable: true,
    },
    File {
        name: "rift.env",
        about: "Tells desktop-client and game-server where to connect. Keep it next to them.",
        executable: false,
    },
];

const TO_MAKE: [File; 3] = [
    File {
        name: "editor",
        about: "Makes and changes games.",
        executable: true,
    },
    File {
        name: "game-server",
        about: "Runs a game that desktop-client connects to.",
        executable: true,
    },
    File {
        name: "rift-example-game.zip",
        about: "The example game, to open in editor.",
        executable: false,
    },
];

async fn downloads(State(app): State<Arc<App>>, jar: CookieJar) -> Response {
    let links = |platform: &Platform, files: &[File]| -> Vec<Download> {
        files
            .iter()
            .map(|file| {
                let suffix = if file.executable {
                    platform.executable_suffix
                } else {
                    ""
                };
                let name = format!("{}{suffix}", file.name);
                Download {
                    about: file.about,
                    url: format!("{}/{}/{name}", app.downloads_url, platform.id),
                    name,
                }
            })
            .collect()
    };
    let platforms = PLATFORMS
        .iter()
        .map(|platform| PlatformDownloads {
            platform,
            to_play: links(platform, &TO_PLAY),
            to_make: links(platform, &TO_MAKE),
        })
        .collect();
    page(Downloads {
        nav: app.nav(&jar, "/downloads").await,
        platforms,
        domain: app.domain.clone(),
    })
}

fn page<T: Template>(template: T) -> Response {
    match template.render() {
        Ok(html) => Html(html).into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

async fn favicon() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/png")],
        include_bytes!("../static/favicon.png").as_slice(),
    )
}

async fn css() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/css"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        include_str!("../static/site.css"),
    )
}
