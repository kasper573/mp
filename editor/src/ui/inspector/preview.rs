use egui::{Align, Color32, Layout, RichText, Sense, Ui, Vec2};
use serde_json::Value;

use super::quests::quest_parties_sections;
use super::usages::show_usages_grouped;
use super::{theme, widgets};
use crate::app::Editor;

pub struct PreviewState {
    pub action: String,
    pub direction: String,
    pub playing: bool,
    pub started: f64,
}

impl Default for PreviewState {
    fn default() -> PreviewState {
        PreviewState {
            action: "idle".to_owned(),
            direction: "s".to_owned(),
            playing: true,
            started: 0.0,
        }
    }
}

pub fn show_preview(editor: &mut Editor, ui: &mut Ui) {
    let selection = editor.selection.clone();
    let keys: Vec<String> = selection.keys.clone();
    if keys.is_empty() {
        return;
    }
    let several = keys.len() > 1;
    let columns = if several { 2 } else { 1 };
    let width = (ui.available_width() - if several { 8.0 } else { 0.0 }) / columns as f32;
    let height = if several { width * 0.7 } else { width * 0.72 };
    let now = ui.input(|i| i.time);
    let state = &editor.views.preview;
    let elapsed = if state.playing {
        now - state.started
    } else {
        0.0
    };
    let (action, direction) = (state.action.clone(), state.direction.clone());
    let mut nameplates: Vec<String> = Vec::new();
    egui::Grid::new("previews")
        .num_columns(columns)
        .spacing([8.0, 8.0])
        .show(ui, |ui| {
            for (index, key) in keys.iter().enumerate() {
                let Some(value) = editor.row_value(&selection.table, key) else {
                    continue;
                };
                draw_preview(
                    editor,
                    ui,
                    &selection.table,
                    key,
                    &value,
                    Vec2::new(width, height),
                    &action,
                    &direction,
                    elapsed as f32,
                    &mut nameplates,
                );
                if (index + 1) % columns == 0 {
                    ui.end_row();
                }
            }
        });
    if selection.table == "quest" && keys.len() == 1 {
        quest_parties_sections(editor, ui, &keys[0]);
    }
    if selection.table == "test_character" && keys.len() == 1 {
        crate::views::character::preview_extras(editor, ui, &keys[0]);
    }
    if matches!(selection.table.as_str(), "npc" | "player" | "model") {
        ui.horizontal(|ui| {
            let state = &mut editor.views.preview;
            egui::ComboBox::from_id_salt("preview-action")
                .selected_text(&state.action)
                .width(80.0)
                .show_ui(ui, |ui| {
                    for action in ["idle", "walk", "run", "attack", "death"] {
                        ui.selectable_value(&mut state.action, action.to_owned(), action);
                    }
                });
            egui::ComboBox::from_id_salt("preview-direction")
                .selected_text(&state.direction)
                .width(56.0)
                .show_ui(ui, |ui| {
                    for direction in ["s", "sw", "w", "nw", "n", "ne", "e", "se"] {
                        ui.selectable_value(&mut state.direction, direction.to_owned(), direction);
                    }
                });
            if ui.button(if state.playing { "⏸" } else { "▸" }).clicked() {
                state.playing = !state.playing;
                state.started = now;
            }
        });
        if editor.views.preview.playing {
            ui.ctx().request_repaint();
        }
    }
    ui.add_space(6.0);
    for key in &keys {
        show_usages_grouped(editor, ui, &selection.table, key, several);
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn draw_preview(
    editor: &mut Editor,
    ui: &mut Ui,
    table: &str,
    key: &str,
    value: &Value,
    size: Vec2,
    action: &str,
    direction: &str,
    elapsed: f32,
    nameplates: &mut Vec<String>,
) {
    let ctx = ui.ctx().clone();
    let Some(content) = editor.project.as_ref().and_then(|project| project.content) else {
        return;
    };
    if table == "quest" {
        let Editor { project, form, .. } = editor;
        let project = project.as_ref().expect("a project");
        ui.vertical(|ui| {
            ui.set_width(size.x);
            quest_card(ui, &ctx, form, &project.files, content, key, size.x);
        });
        return;
    }
    let (rect, _) = ui.allocate_exact_size(size, Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 6.0, Color32::from_rgb(78, 128, 52));
    let Editor { project, form, .. } = editor;
    let project = project.as_ref().expect("a project");
    painter.rect_stroke(
        rect,
        6.0,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Outside,
    );
    if table == "item" {
        if let Some(path) = value["icon"].as_str()
            && let Some(thumb) = form.thumbnails.image(&ctx, &project.files, path)
        {
            let scale = (size.y * 0.5 / thumb.size[1].max(1) as f32).clamp(1.0, 6.0);
            let shown = Vec2::new(thumb.size[0] as f32 * scale, thumb.size[1] as f32 * scale);
            painter.image(
                thumb.texture.id(),
                egui::Rect::from_center_size(rect.center(), shown),
                egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
                Color32::WHITE,
            );
        }
        return;
    }
    let model_key = match table {
        "model" => Some(key.to_owned()),
        "test_character" => Some(
            content
                .built::<game::systems::GameSettings>()
                .player
                .get(&content)
                .model
                .key(&content)
                .to_owned(),
        ),
        _ => value["model"].as_str().map(str::to_owned),
    };
    let Some(id) = model_key
        .and_then(|model_key| content.by_key::<game::systems::actor::bust::ModelDef>(&model_key))
    else {
        return;
    };
    let model = game::systems::actor::model(&content, id);
    let Some(thumb) = form
        .thumbnails
        .image(&ctx, &project.files, model.sheet().as_str())
    else {
        return;
    };
    let action = match action {
        "walk" => game::systems::actor::Action::Walk,
        "run" => game::systems::actor::Action::Run,
        "attack" => game::systems::actor::Action::Attack,
        "death" => game::systems::actor::Action::Dead,
        _ => game::systems::actor::Action::Idle,
    };
    let dir = match direction {
        "sw" => game::core::math::Direction::SW,
        "w" => game::core::math::Direction::W,
        "nw" => game::core::math::Direction::NW,
        "n" => game::core::math::Direction::N,
        "ne" => game::core::math::Direction::NE,
        "e" => game::core::math::Direction::E,
        "se" => game::core::math::Direction::SE,
        _ => game::core::math::Direction::S,
    };
    let region = model.frame(
        action,
        dir,
        game::core::time::Seconds(elapsed),
        game::core::time::PlaybackRate(1.0),
    );
    let drawn = model.drawn_size(region);
    let scale = (size.y * 0.6 / drawn.height.max(1.0))
        .clamp(1.0, 4.0)
        .floor();
    let shown = Vec2::new(drawn.width * scale, drawn.height * scale);
    let feet = crate::views::model::preview::spawn_backdrop(
        editor,
        &painter,
        rect,
        format!("inspector-preview:{table}/{key}"),
        scale,
    )
    .unwrap_or(rect.center() + Vec2::new(0.0, size.y * 0.22));
    let sprite = crate::views::model::preview::sprite_rect(feet, shown);
    let tint = value["modules"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|m| m["type"] == "tint")
        .and_then(|m| {
            m["rgba"].as_array().map(|rgba| {
                Color32::from_rgba_unmultiplied(
                    rgba[0].as_u64().unwrap_or(255) as u8,
                    rgba[1].as_u64().unwrap_or(255) as u8,
                    rgba[2].as_u64().unwrap_or(255) as u8,
                    rgba[3].as_u64().unwrap_or(255) as u8,
                )
            })
        })
        .unwrap_or(Color32::WHITE);
    let uv = crate::thumbs::uv(
        thumb.size,
        region.min().x,
        region.min().y,
        region.size.width,
        region.size.height,
    );
    painter.image(thumb.texture.id(), sprite, uv, tint);
    if let Some(name) = value["name"].as_str() {
        let colour = match attitude(Some(content), table, key, value) {
            Some(true) => game_colour(ui::tokens::palette::CRIMSON_80),
            _ => Color32::WHITE,
        };
        painter.text(
            sprite.center_top() - Vec2::new(0.0, 8.0),
            egui::Align2::CENTER_BOTTOM,
            name,
            egui::FontId::proportional(13.0),
            colour,
        );
        nameplates.push(name.to_owned());
    }
}

pub(super) fn game_colour(colour: bevy::prelude::Color) -> Color32 {
    let srgba = colour.to_srgba();
    Color32::from_rgba_unmultiplied(
        (srgba.red * 255.0) as u8,
        (srgba.green * 255.0) as u8,
        (srgba.blue * 255.0) as u8,
        (srgba.alpha * 255.0) as u8,
    )
}

pub(super) fn quest_card(
    ui: &mut Ui,
    ctx: &egui::Context,
    form: &mut crate::forms::FormState,
    files: &crate::project::Files,
    content: game::core::content::Content,
    key: &str,
    width: f32,
) {
    use game::core::script::dialogue::Reveal;
    use game::systems::quest::{ActiveQuest, Parties, QuestDef};
    let Some(id) = content.by_key::<QuestDef>(key) else {
        return;
    };
    if !content.has_built::<game::systems::script::RiftScripts>() {
        return;
    }
    let def = id.get(&content);
    let parties = Parties::of(
        &content,
        content.built::<game::systems::script::RiftScripts>(),
    );
    let progress = def.progress(&content, &parties, &ActiveQuest::fresh(&content, id), None);
    let ink = Color32::from_rgb(236, 230, 214);
    let soft = Color32::from_rgba_unmultiplied(236, 230, 214, 150);
    let mut icon = |ui: &mut Ui, path: &str, size: f32| {
        if let Some(thumb) = form.thumbnails.image(ctx, files, path) {
            ui.add(egui::Image::from_texture((
                thumb.texture.id(),
                Vec2::splat(size),
            )));
        } else {
            ui.allocate_exact_size(Vec2::splat(size), Sense::hover());
        }
    };
    egui::Frame::new()
        .fill(Color32::from_rgb(38, 32, 28))
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(120, 96, 60)))
        .corner_radius(8.0)
        .inner_margin(14.0)
        .show(ui, |ui| {
            ui.set_width(width - 28.0);
            ui.spacing_mut().item_spacing.y = 8.0;
            ui.horizontal(|ui| {
                icon(ui, def.icon(&content).as_str(), 28.0);
                ui.label(RichText::new(&def.title).size(17.0).color(ink).strong());
            });
            ui.label(
                RichText::new(format!("{} · {}", def.kinds(), def.meta(&parties, id)))
                    .size(12.0)
                    .color(soft),
            );
            ui.label(RichText::new(&def.blurb).size(13.0).color(ink));
            ui.label(RichText::new("OBJECTIVES").size(11.0).color(soft));
            for (objective, progress) in def.objectives().zip(&progress) {
                ui.horizontal(|ui| {
                    icon(ui, objective.icon(&content).as_str(), 20.0);
                    ui.label(RichText::new(&progress.label).size(13.0).color(ink));
                    if progress.counted {
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            ui.label(
                                RichText::new(format!("{} / {}", progress.have, progress.need))
                                    .size(12.5)
                                    .color(ink),
                            );
                        });
                    }
                });
            }
            if def.reveals(Reveal::Gains) {
                ui.label(RichText::new("REWARDS").size(11.0).color(soft));
                ui.horizontal_wrapped(|ui| {
                    if def.xp > 0 {
                        widgets::chip_coloured(
                            ui,
                            &format!("{} XP", def.xp),
                            Color32::TRANSPARENT,
                            ink,
                        );
                    }
                    for stack in def.rewards() {
                        let item = stack.item.get(&content);
                        ui.horizontal(|ui| {
                            icon(ui, item.icon.as_str(), 16.0);
                            let label = if stack.count == 1 {
                                item.name.clone()
                            } else {
                                format!("{} ×{}", item.name, stack.count)
                            };
                            widgets::chip_coloured(ui, &label, Color32::TRANSPARENT, ink);
                        });
                    }
                });
                if !def.pick_one().is_empty() {
                    ui.label(
                        RichText::new("PICK ONE WHEN YOU RETURN")
                            .size(11.0)
                            .color(soft),
                    );
                    ui.horizontal(|ui| {
                        for stack in def.pick_one() {
                            icon(ui, stack.item.get(&content).icon.as_str(), 28.0);
                        }
                    });
                }
            }
            ui.label(
                RichText::new("Accept or decline in the conversation")
                    .size(12.0)
                    .color(soft),
            );
        });
}

pub(super) fn attitude(
    content: Option<game::core::content::Content>,
    table: &str,
    key: &str,
    value: &Value,
) -> Option<bool> {
    let content = content?;
    if !content.has_built::<game::systems::script::RiftScripts>() {
        return None;
    }
    let scripts = content.built::<game::systems::script::RiftScripts>();
    let mut friendly = false;
    for (index, module) in value["modules"]
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
    {
        if !module["type"]
            .as_str()
            .is_some_and(|tag| tag.ends_with("_script"))
        {
            continue;
        }
        let Some(bound) = crate::views::script::panel::owner_row(
            &content,
            table,
            key,
            &format!("/modules/{index}"),
        ) else {
            continue;
        };
        for reach in scripts.may_do(bound.row).reaches {
            match reach {
                game::systems::script::Reach::Hostile => return Some(true),
                game::systems::script::Reach::Friendly => friendly = true,
                _ => {}
            }
        }
    }
    friendly.then_some(false)
}
