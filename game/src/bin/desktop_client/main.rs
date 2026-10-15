mod platform;
mod store;

use std::num::NonZeroU32;
use std::sync::Arc;

use bevy::window::{PresentMode, Window};
use game::core::platform::{StartParams, exit_when_stdin_closes};
use game::systems::launch::{BUILD_INFO_FLAG, CLIENT_ENV_PREFIX, ClientConfig, build_info_line};
use game::systems::{client_app, probe};

fn main() {
    if std::env::args().any(|arg| arg == BUILD_INFO_FLAG) {
        println!("{}", build_info_line());
        return;
    }
    let config: ClientConfig = envy::prefixed(CLIENT_ENV_PREFIX)
        .from_env()
        .expect("RIFT_CLIENT_* environment");
    if config.exit_on_stdin_eof {
        exit_when_stdin_closes();
    }
    let params = StartParams {
        access_token: Some(config.access_token),
        game_server_url: config.game_server_url,
        game_server_ws_url: config.game_server_ws_url,
    };
    let mut app = client_app(
        Arc::new(platform::DesktopPlatform::new(config.profile_dir)),
        params,
        window(),
    );
    if let Some(driver) = config.probe {
        probe::install(&mut app, platform::SocketProbe::connect(driver));
    }
    app.run();
}

// Frames go out without waiting on the display's refresh. A desktop may hold that wait up, as some
// do for tens of milliseconds at every mouse press and release, and the whole frame would wait too.
fn window() -> Window {
    Window {
        present_mode: PresentMode::AutoNoVsync,
        desired_maximum_frame_latency: Some(FRAMES_IN_FLIGHT),
        ..Default::default()
    }
}

// A compositor hands a frame's buffer back only when it next refreshes, so it's the frames in
// flight, not the client, that would otherwise cap the frame rate at a few per refresh.
const FRAMES_IN_FLIGHT: NonZeroU32 = NonZeroU32::new(8).unwrap();
