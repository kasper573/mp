use ab_glyph::{Font, FontRef, PxScale, ScaleFont};

use crate::face::Face;
use crate::fonts;

/// A line of text drawn in one of the faces as coverage, a byte per pixel row by row: what a
/// shader works text from. `size` is the em in pixels, as the interface sizes its text; `pad`
/// clear pixels ring the ink, room for an outline or a glow.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Raster {
    pub width: u32,
    pub height: u32,
    pub coverage: Vec<u8>,
}

pub fn raster(face: Face, size: f32, text: &str, pad: u32) -> Raster {
    let font = FontRef::try_from_slice(fonts::bytes(face)).expect("every face is a font");
    let line = font.height_unscaled() / font.units_per_em().unwrap_or(1.0);
    let scaled = font.as_scaled(PxScale::from(size * line));
    let mut caret = 0.0;
    let mut glyphs = Vec::new();
    let mut previous = None;
    for ch in text.chars() {
        let id = scaled.glyph_id(ch);
        if let Some(previous) = previous {
            caret += scaled.kern(previous, id);
        }
        glyphs.push(
            id.with_scale_and_position(scaled.scale(), ab_glyph::point(caret, scaled.ascent())),
        );
        caret += scaled.h_advance(id);
        previous = Some(id);
    }
    let width = caret.ceil() as u32 + 2 * pad;
    let height = (scaled.ascent() - scaled.descent()).ceil() as u32 + 2 * pad;
    let mut coverage = vec![0; (width * height) as usize];
    for glyph in glyphs {
        let Some(outlined) = font.outline_glyph(glyph) else {
            continue;
        };
        let bounds = outlined.px_bounds();
        outlined.draw(|x, y, cover| {
            let x = bounds.min.x as i64 + i64::from(x) + i64::from(pad);
            let y = bounds.min.y as i64 + i64::from(y) + i64::from(pad);
            if (0..i64::from(width)).contains(&x) && (0..i64::from(height)).contains(&y) {
                let at = (y as u32 * width + x as u32) as usize;
                let ink = (cover.clamp(0.0, 1.0) * 255.0).round() as u8;
                coverage[at] = coverage[at].max(ink);
            }
        });
    }
    Raster {
        width,
        height,
        coverage,
    }
}
