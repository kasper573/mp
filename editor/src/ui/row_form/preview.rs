use egui::{Align, Color32, Layout, RichText, Sense, Ui, Vec2};
use engine::core::content::Content;
use engine::core::math::{Direction, Rgba};
use engine::core::time::Seconds;
use engine::systems::GameSettings;
use engine::systems::actor::Action;
use engine::systems::actor::model::ModelDef;
use engine::systems::actor::plate::PlateLabel;
use engine::systems::dialogue::ChoiceReveal;
use engine::systems::item::ItemDef;
use engine::systems::quest::{ActiveQuest, Parties, QuestDef};
use engine::systems::script::{Reach, RiftScripts};
use engine::systems::skill::SkillDef;
use engine::systems::status::StatusEffectDef;
use serde_json::Value;
use strum::VariantArray;

use super::quests::quest_parties_sections;
use super::{theme, widgets};
use crate::app::Editor;
use crate::project::ProjectFiles;
use crate::stage::{self, Posed, PosedActor, Scenario, Scene};
use crate::views::character;
use crate::views::script::panel;
use crate::{forms, value};

pub struct RowPreviewState {
    pub action: Action,
    pub direction: Direction,
    pub playing: bool,
    pub started: f64,
    /// The model a status effect is shown on; the player's until one is picked.
    pub status_model: Option<String>,
    pub status_applied: bool,
}

impl Default for RowPreviewState {
    fn default() -> RowPreviewState {
        RowPreviewState {
            action: Action::Idle,
            direction: Direction::S,
            playing: true,
            started: 0.0,
            status_model: None,
            status_applied: false,
        }
    }
}

pub(super) struct Pose {
    action: Action,
    direction: Direction,
    playing: bool,
}

pub fn has_preview(table: &str) -> bool {
    matches!(
        table,
        "npc"
            | "player"
            | "model"
            | "item"
            | "quest"
            | "test_character"
            | "status_effect"
            | "skill"
    )
}

/// The row as the game shows it, beside its form: the actor, item or quest card it stands for, a
/// status effect on an actor, a skill cast over and over.
pub fn show_beside(editor: &mut Editor, ui: &mut Ui, table: &str, key: &str) {
    let Some(value) = editor.row_value(table, key) else {
        return;
    };
    match table {
        "status_effect" => return show_status(editor, ui, key),
        "skill" => return show_skill(editor, ui, key),
        _ => {}
    }
    let now = ui.input(|i| i.time);
    let state = &editor.views.preview;
    let pose = Pose {
        action: state.action,
        direction: state.direction,
        playing: state.playing,
    };
    draw_preview(editor, ui, table, key, &value, &pose);
    if table == "quest" {
        quest_parties_sections(editor, ui, key);
    }
    if table == "test_character" {
        character::preview_extras(editor, ui, key);
    }
    if matches!(table, "npc" | "player" | "model") {
        ui.horizontal(|ui| {
            let state = &mut editor.views.preview;
            widgets::combo_box("preview-action")
                .selected_text(state.action.as_ref())
                .width(80.0)
                .show_ui(ui, |ui| {
                    for &action in Action::VARIANTS {
                        ui.selectable_value(&mut state.action, action, action.as_ref());
                    }
                });
            widgets::combo_box("preview-direction")
                .selected_text(state.direction.as_ref())
                .width(56.0)
                .show_ui(ui, |ui| {
                    for &direction in Direction::VARIANTS {
                        ui.selectable_value(&mut state.direction, direction, direction.as_ref());
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
}

/// A status effect on one actor of the designer's choosing, applied and removed at a press, in a
/// game world that plays the effect out for real.
fn show_status(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(content) = editor.loaded() else {
        ui.label(theme::muted("the preview plays once the content loads"));
        return;
    };
    let Some(effect) = content.by_key::<StatusEffectDef>(key) else {
        ui.label(theme::muted("the preview plays once the row loads"));
        return;
    };
    let models: Vec<String> = content.table::<ModelDef>().keys().to_vec();
    let state = &mut editor.views.preview;
    let chosen = state.status_model.get_or_insert_with(|| {
        content
            .built::<GameSettings>()
            .player
            .get(&content)
            .model
            .key(&content)
            .to_owned()
    });
    ui.horizontal(|ui| {
        widgets::combo_box("preview-status-model")
            .selected_text(theme::mono(chosen.as_str()).size(13.0))
            .width(160.0)
            .show_ui(ui, |ui| {
                for candidate in &models {
                    ui.selectable_value(chosen, candidate.clone(), candidate);
                }
            });
        let label = if state.status_applied {
            "remove status effect"
        } else {
            "apply status effect"
        };
        if ui.button(label).clicked() {
            state.status_applied = !state.status_applied;
        }
    });
    let Some(model) = content.by_key::<ModelDef>(chosen) else {
        ui.label(theme::warn("pick a model to show the effect on"));
        return;
    };
    let scene = Scene::Live(Scenario::Status {
        model,
        effect,
        applied: state.status_applied,
    });
    stage::show(editor, ui, &format!("status_effect/{key}"), scene, true);
}

/// A skill cast on a loop by a character set up to cast it, at whatever it targets, in a game
/// world that plays each cast out for real.
fn show_skill(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(content) = editor.loaded() else {
        ui.label(theme::muted("the preview plays once the content loads"));
        return;
    };
    let Some(skill) = content.by_key::<SkillDef>(key) else {
        ui.label(theme::muted("the preview plays once the row loads"));
        return;
    };
    let scene = Scene::Live(Scenario::Skill { skill });
    if let Some(shown) = stage::show(editor, ui, &format!("skill/{key}"), scene, true)
        && let Some(report) = shown.report
    {
        ui.label(theme::muted(report).size(12.0));
    }
}

pub(super) fn draw_preview(
    editor: &mut Editor,
    ui: &mut Ui,
    table: &str,
    key: &str,
    value: &Value,
    pose: &Pose,
) {
    let ctx = ui.ctx().clone();
    let Some(content) = editor.loaded() else {
        return;
    };
    if table == "quest" {
        let width = ui.available_width();
        let Editor { project, form, .. } = editor;
        let project = project.as_ref().expect("a project");
        ui.vertical(|ui| {
            ui.set_width(width);
            quest_card(ui, &ctx, form, &project.files, &content, key, width);
        });
        return;
    }
    let center = stage::center(&content);
    let mut posed = Posed::default();
    if table == "item" {
        posed.items.extend(content.by_key::<ItemDef>(key));
    } else {
        let model_key = match table {
            "model" => key.to_owned(),
            "test_character" => content
                .built::<GameSettings>()
                .player
                .get(&content)
                .model
                .key(&content)
                .to_owned(),
            _ => value["model"].as_str().unwrap_or_default().to_owned(),
        };
        let Some(model) = content.by_key::<ModelDef>(&model_key) else {
            ui.label(theme::muted("pick a model to see it"));
            return;
        };
        let tint = value["modules"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|m| m["type"] == "tint")
            .map_or(Rgba::WHITE, |m| {
                Rgba(u32::from_be_bytes(value::rgba(&m["rgba"])))
            });
        let plate = plate_of(&content, table, key, value);
        posed.actors.push(PosedActor {
            action: pose.action,
            dir: pose.direction,
            tint,
            plate,
            held: (!pose.playing).then_some(Seconds(0.0)),
            ..PosedActor::standing(model, center)
        });
    }
    stage::show(
        editor,
        ui,
        &format!("{table}/{key}"),
        Scene::Posed(posed),
        true,
    );
}

/// The plate the row's actor wears in game: an npc's name and role once it has a nameplate, a
/// test character's name as a player.
fn plate_of(content: &Content, table: &str, key: &str, value: &Value) -> Option<PlateLabel> {
    match table {
        "npc" => {
            let role = value["modules"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|module| module["type"] == "nameplate")
                .and_then(|module| module["role"].as_str())?;
            let name = value["name"].as_str().unwrap_or(key);
            let hostile = attitude(content, table, key, value) == Some(true);
            Some(PlateLabel::npc(name, role, hostile))
        }
        "test_character" => Some(PlateLabel::player(value["name"].as_str().unwrap_or(key))),
        _ => None,
    }
}

pub(super) fn quest_card(
    ui: &mut Ui,
    ctx: &egui::Context,
    form: &mut forms::FormState,
    files: &ProjectFiles,
    content: &Content,
    key: &str,
    width: f32,
) {
    let Some(id) = content.by_key::<QuestDef>(key) else {
        return;
    };
    if !content.has_built::<RiftScripts>() {
        return;
    }
    let def = id.get(content);
    let parties = Parties::of(content, content.built::<RiftScripts>());
    let progress = def.progress(content, &parties, &ActiveQuest::fresh(content, id), None);
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
                icon(ui, def.icon(content).as_str(), 28.0);
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
                    icon(ui, objective.icon(content).as_str(), 20.0);
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
            if def.reveals(ChoiceReveal::Gains) {
                ui.label(RichText::new("REWARDS").size(11.0).color(soft));
                ui.horizontal_wrapped(|ui| {
                    if def.xp > 0 {
                        widgets::chip_colored(
                            ui,
                            &format!("{} XP", def.xp),
                            Color32::TRANSPARENT,
                            ink,
                        );
                    }
                    for stack in def.rewards() {
                        let item = stack.item.get(content);
                        ui.horizontal(|ui| {
                            icon(ui, item.icon.as_str(), 16.0);
                            let label = if stack.count == 1 {
                                item.name.clone()
                            } else {
                                format!("{} ×{}", item.name, stack.count)
                            };
                            widgets::chip_colored(ui, &label, Color32::TRANSPARENT, ink);
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
                            icon(ui, stack.item.get(content).icon.as_str(), 28.0);
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

fn attitude(content: &Content, table: &str, key: &str, value: &Value) -> Option<bool> {
    if !content.has_built::<RiftScripts>() {
        return None;
    }
    let scripts = content.built::<RiftScripts>();
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
        let Some(bound) = panel::owner_row(content, table, key, &format!("/modules/{index}"))
        else {
            continue;
        };
        for reach in scripts.may_do(bound.row).reaches {
            match reach {
                Reach::Hostile => return Some(true),
                Reach::Friendly => friendly = true,
                _ => {}
            }
        }
    }
    friendly.then_some(false)
}
