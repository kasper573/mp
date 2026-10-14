use bevy_color::Color;
use bevy_picking::prelude::Pickable;
use bevy_scene::{Scene, bsn};
use bevy_text::{FontSource, FontSourceTemplate, FontWeight, TextFont, TextFontTemplate};
use bevy_ui::widget::Text;

use crate::style::Style;
use crate::theme::theme;
use crate::tokens::typography::{self, Typography};

pub fn text(content: impl Into<String>) -> impl Scene {
    text_colored(content, theme().surface_canvas.on)
}

pub fn text_colored(content: impl Into<String>, color: Color) -> impl Scene {
    styled_text(content, color, typography::BODY)
}

pub fn styled_text(content: impl Into<String>, color: Color, typography: Typography) -> impl Scene {
    let style = Style::new().text_color(color);
    bsn! {
        Text({content.into()})
        font_template(typography)
        Pickable { should_block_lower: false, is_hoverable: false }
        style
    }
}

pub(crate) fn font(typography: Typography) -> TextFont {
    TextFont {
        font: FontSource::Family(typography.family.into()),
        font_size: typography.font_size.into(),
        weight: FontWeight(typography.weight),
        ..Default::default()
    }
}

pub(crate) fn font_template(typography: Typography) -> TextFontTemplate {
    TextFontTemplate {
        font: FontSourceTemplate::Family(typography.family.into()),
        font_size: typography.font_size.into(),
        weight: FontWeight(typography.weight),
        ..Default::default()
    }
}
