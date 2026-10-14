use bevy_scene::{Scene, bsn};

use crate::components::dialog::modal;
use crate::overlay::OverlayAction;

pub fn alert_dialog(open: bool, trigger: impl Scene, content: impl Scene) -> impl Scene {
    modal(open, false, trigger, content)
}

pub fn alert_dialog_cancel() -> impl Scene {
    bsn! { ~{OverlayAction::Close} }
}

pub fn alert_dialog_action() -> impl Scene {
    bsn! { ~{OverlayAction::Close} }
}
