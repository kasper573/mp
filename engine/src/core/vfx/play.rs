//! Where a layer is in its run and what it shows there, worked out the same wherever a vfx is
//! drawn: on the client's world and interface, and on the editor's stage.

use crate::core::math::{FrameSize, Pos, Rect, Size, WorldPx};
use crate::core::time::{Hertz, Seconds};

use super::{SpriteAnchor, SpritePlay, VfxLayer};

/// A layer caught mid-run: the seconds since it began and how far through its duration it is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LayerTime {
    pub local: Seconds,
    pub progress: f32,
}

/// Where a text layer has floated to: how far along its rise, easing out, and how much of it is
/// still showing, fading over the last stretch.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TextFloat {
    pub risen: f32,
    pub alpha: f32,
}

impl VfxLayer {
    /// Where the layer is at `elapsed` seconds into its instance, or nothing while it waits for its
    /// delay or once it is over.
    pub fn at(&self, elapsed: Seconds) -> Option<LayerTime> {
        let local = elapsed - self.delay();
        let duration = self.duration();
        (local.0 >= 0.0 && local <= duration).then(|| LayerTime {
            local,
            progress: (local.0 / duration.0.max(0.001)).clamp(0.0, 1.0),
        })
    }
}

/// The cell of a sprite sheet of `sheet` pixels a sprite layer shows at `local`, or nothing once a
/// layer played once has shown its last frame.
pub fn sprite_cell(
    sheet: Size<WorldPx>,
    frame: FrameSize,
    frames: u32,
    fps: Hertz,
    play: SpritePlay,
    local: Seconds,
) -> Option<Rect<WorldPx>> {
    let index = (local.0 * fps.0) as u32;
    let index = match play {
        SpritePlay::Once if index >= frames => return None,
        SpritePlay::Once => index,
        SpritePlay::Loop { .. } => index % frames.max(1),
    };
    let cell = Size::new(frame.width as f32, frame.height as f32);
    let columns = ((sheet.width / cell.width) as u32).max(1);
    Some(Rect::new(
        Pos::new(
            (index % columns) as f32 * cell.width,
            (index / columns) as f32 * cell.height,
        ),
        cell,
    ))
}

impl SpriteAnchor {
    /// Where the centre of a sprite `drawn` tall lands on a site `size` tall at `center`, with the
    /// y axis up: on the centre, standing on the feet or sitting on the head.
    pub fn place_y(self, center: f32, size: f32, drawn: f32) -> f32 {
        match self {
            SpriteAnchor::Center => center,
            SpriteAnchor::Feet => center - size / 2.0 + drawn / 2.0,
            SpriteAnchor::Head => center + size / 2.0 + drawn / 2.0,
        }
    }
}

impl TextFloat {
    pub fn at(progress: f32) -> TextFloat {
        TextFloat {
            risen: 1.0 - (1.0 - progress) * (1.0 - progress),
            alpha: 1.0 - ((progress - 0.6) / 0.4).clamp(0.0, 1.0),
        }
    }
}
