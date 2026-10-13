use std::sync::Arc;

use game::systems::client_app;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::platform::{WebPlatform, primary_window, read_start_params};
use crate::probe::ProbePlugin;

#[wasm_bindgen(module = "/src/bin/client/audio-unlock.js")]
unsafe extern "C" {
    fn audio_unlock();
}

pub fn run() {
    console_error_panic_hook::set_once();
    audio_unlock();
    let params = read_start_params();
    client_app(Arc::new(WebPlatform), params, primary_window())
        .add_plugins(ProbePlugin)
        .run();
}
