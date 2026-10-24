//! The dark ground of notices: what floats over the world to tell the player something stays apart
//! from the paper of windows and cards.

use egui::epaint::Shadow;
use egui::{Color32, CornerRadius, Frame, Margin, Stroke};

pub const FILL: Color32 = Color32::from_rgb(38, 38, 43);
pub const BORDER: Color32 = Color32::from_rgb(50, 50, 57);
pub const HOVER: Color32 = Color32::from_rgb(48, 48, 54);
pub const TEXT: Color32 = Color32::from_rgb(228, 228, 232);
pub const DANGER: Color32 = Color32::from_rgb(226, 90, 90);

pub const RADIUS: CornerRadius = CornerRadius::same(6);
pub const SHADOW: Shadow = Shadow {
    offset: [0, 6],
    blur: 18,
    spread: 0,
    color: Color32::from_black_alpha(140),
};

pub fn frame() -> Frame {
    Frame::new()
        .fill(FILL)
        .stroke(Stroke::new(1.0, BORDER))
        .corner_radius(RADIUS)
        .inner_margin(Margin::same(8))
        .shadow(SHADOW)
}
