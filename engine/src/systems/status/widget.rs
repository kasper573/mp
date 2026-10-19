use bevy::prelude::*;
use design_tokens::ink;
use egui::load::SizedTexture;
use egui::{Color32, Sense, Stroke, StrokeKind, Ui, Vec2};

use super::{StatusCategory, StatusInstance, Statuses};
use crate::core::content::Content;
use crate::core::gui;
use crate::core::time::{self, UnixMillis};
use crate::systems::hud;
use crate::systems::player::session;
use crate::systems::text::duration;

const ICON: f32 = 24.0;
const GAP: f32 = 4.0;

/// The statuses on the character as rows of icons hanging below the character panel, as wide as
/// the panel, a buff ringed green and a debuff red, each with a tooltip of what it is and how long
/// it has left.
pub fn grid(ui: &mut Ui, world: &mut World) {
    let Some(me) = session::my_character(world) else {
        return;
    };
    let statuses = me.get::<Statuses>().cloned().unwrap_or_default();
    if statuses.0.is_empty() {
        return;
    }
    let content = world.resource::<Content>().clone();
    let now = time::server_now(world);
    ui.add_space(GAP);
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing = Vec2::splat(GAP);
        for status in &statuses.0 {
            let def = status.effect.get(&content);
            let (rect, response) = ui.allocate_exact_size(Vec2::splat(ICON), Sense::hover());
            if let Some(image) = gui::image(world, &def.icon) {
                egui::Image::new(SizedTexture::new(image.texture, Vec2::splat(ICON)))
                    .paint_at(ui, rect);
            }
            ui.painter().rect_stroke(
                rect,
                3.0,
                Stroke::new(1.0, ring(def.category)),
                StrokeKind::Outside,
            );
            let label = format!("Status {}: {}", def.name, def.category.label());
            response.widget_info(|| {
                egui::WidgetInfo::labeled(egui::WidgetType::Label, true, label.clone())
            });
            let lines: Vec<String> = [
                Some(format!(
                    "{} · {}",
                    def.category.label(),
                    time_left(status, now)
                )),
                (!def.description.is_empty()).then(|| def.description.clone()),
            ]
            .into_iter()
            .flatten()
            .collect();
            hud::tooltip(&response, world, &def.name, &lines, None);
        }
    });
}

pub fn ring(category: StatusCategory) -> Color32 {
    match category {
        StatusCategory::Buff => ink::VERDIGRIS,
        StatusCategory::Debuff => ink::RUBRIC,
    }
}

pub fn time_left(status: &StatusInstance, now: Option<UnixMillis>) -> String {
    match (status.until, now) {
        (Some(until), Some(now)) if until > now => format!("{} left", duration(until.since(now))),
        (Some(_), _) => "Ending".to_owned(),
        (None, _) => "Until removed".to_owned(),
    }
}
