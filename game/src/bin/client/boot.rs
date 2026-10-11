use std::sync::Arc;

use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen(module = "/src/bin/client/audio-unlock.js")]
unsafe extern "C" {
    fn audio_unlock();
}

pub fn run() {
    console_error_panic_hook::set_once();
    audio_unlock();
    let params = crate::platform::read_start_params();
    game::systems::client_app(
        Arc::new(crate::platform::WebPlatform),
        params,
        crate::platform::primary_window(),
    )
    .add_plugins(crate::probe::ProbePlugin)
    .run();
}
