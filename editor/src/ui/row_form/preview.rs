use design_tokens::card::{self};
use design_tokens::glyph::{self, Mark};
use egui::Ui;
use engine::core::audio::playback::SfxDef;
use engine::core::babble::BabbleDef;
use engine::core::content::{Content, ContentRow};
use engine::core::gui::ImageSource;
use engine::core::math::{Direction, Rgba};
use engine::core::time::Seconds;
use engine::systems::GameSettings;
use engine::systems::actor::Action;
use engine::systems::actor::model::ModelDef;
use engine::systems::actor::plate::PlateLabel;
use engine::systems::item::card::CardLook;
use engine::systems::item::{self, ItemDef};
use engine::systems::npc::NpcDef;
use engine::systems::player::PlayerDef;
use engine::systems::player::snapshot::CharacterSnapshot;
use engine::systems::quest::card::{Moment, QuestCardLook};
use engine::systems::quest::{self, Parties, QuestDef};
use engine::systems::script::{Reach, RiftScripts};
use engine::systems::skill::SkillDef;
use engine::systems::status::StatusEffectDef;
use serde_json::Value;
use strum::VariantArray;

use super::quests::quest_parties_sections;
use super::{theme, widgets};
use crate::app::Editor;
use crate::stage::{self, Posed, PosedActor, Scenario, Scene};
use crate::thumbs::ProjectImages;
use crate::value::{self, RowValue};
use crate::views::character;
use crate::views::script::panel;
use crate::views::sound::BabbleRequest;

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

/// Where a table's preview goes: a column beside the form for one that shows a picture, under the
/// form for one that is a control or two.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PreviewPlace {
    Beside,
    Below,
}

pub fn preview_place(table: &str) -> Option<PreviewPlace> {
    match table {
        NpcDef::TABLE
        | PlayerDef::TABLE
        | ModelDef::TABLE
        | ItemDef::TABLE
        | QuestDef::TABLE
        | CharacterSnapshot::TABLE
        | StatusEffectDef::TABLE
        | SkillDef::TABLE => Some(PreviewPlace::Beside),
        SfxDef::TABLE | BabbleDef::TABLE => Some(PreviewPlace::Below),
        _ => None,
    }
}

/// The row as the game shows it, beside its form: the actor, item or quest card it stands for, a
/// status effect on an actor, a skill cast over and over.
pub fn show(editor: &mut Editor, ui: &mut Ui, table: &str, key: &str) {
    let Some(value) = editor.row_value(table, key) else {
        return;
    };
    match table {
        StatusEffectDef::TABLE => return show_status(editor, ui, key),
        SkillDef::TABLE => return show_skill(editor, ui, key),
        SfxDef::TABLE => return show_sfx(editor, ui, key),
        BabbleDef::TABLE => return show_babble(editor, ui, key),
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
    if table == QuestDef::TABLE {
        quest_parties_sections(editor, ui, key);
    }
    if table == CharacterSnapshot::TABLE {
        character::preview_extras(editor, ui, key);
    }
    if matches!(table, NpcDef::TABLE | PlayerDef::TABLE | ModelDef::TABLE) {
        ui.horizontal(|ui| {
            let state = &mut editor.views.preview;
            widgets::combo("preview-action")
                .selected_text(state.action.as_ref())
                .width(80.0)
                .show_ui(ui, |ui| {
                    for &action in Action::VARIANTS {
                        ui.selectable_value(&mut state.action, action, action.as_ref());
                    }
                });
            widgets::combo("preview-direction")
                .selected_text(state.direction.as_ref())
                .width(56.0)
                .show_ui(ui, |ui| {
                    for &direction in Direction::VARIANTS {
                        ui.selectable_value(&mut state.direction, direction, direction.as_ref());
                    }
                });
            let (mark, word) = if state.playing {
                (Mark::Pause, "Pause")
            } else {
                (Mark::Play, "Play")
            };
            if glyph::button(ui, mark, 14.0, theme::TEXT, word).clicked() {
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
        widgets::combo("preview-status-model")
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

/// An sfx played as the game plays it, with its waveform and how it sits in the mix.
fn show_sfx(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let sound = &mut editor.views.sound;
    if sound.sounding.contains(key) {
        if widgets::primary(ui, "■ stop").clicked() {
            sound.stop.push(key.to_owned());
        }
    } else if widgets::primary(ui, "▶ play").clicked() {
        sound.play.push(key.to_owned());
    }
}

/// A babble speaking a line of the designer's choosing, through the game's own typewriter.
fn show_babble(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let sound = &mut editor.views.sound;
    ui.add(
        egui::TextEdit::multiline(&mut sound.babble_text)
            .desired_rows(2)
            .desired_width(f32::INFINITY),
    );
    if sound.babbling() {
        if widgets::primary(ui, "■ stop").clicked() {
            sound.stop_babble = true;
        }
    } else if widgets::primary(ui, "▶ play").clicked() {
        sound.babble = Some(BabbleRequest {
            babble: key.to_owned(),
            text: sound.babble_text.clone(),
        });
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
    if table == QuestDef::TABLE || table == ItemDef::TABLE {
        let Editor { project, form, .. } = &mut *editor;
        let mut images = ProjectImages {
            ctx: &ctx,
            files: &project.as_ref().expect("a project").files,
            thumbnails: &mut form.thumbnails,
        };
        if table == QuestDef::TABLE {
            quest_card(ui, &mut images, &content, key);
            return;
        }
        item_card(ui, &mut images, &content, key);
        ui.add_space(12.0);
    }
    let center = stage::center(&content);
    let mut posed = Posed::default();
    if table == ItemDef::TABLE {
        posed.items.extend(content.by_key::<ItemDef>(key));
    } else {
        let model_key = match table {
            ModelDef::TABLE => key.to_owned(),
            CharacterSnapshot::TABLE => content
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
        NpcDef::TABLE => {
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
        CharacterSnapshot::TABLE => Some(PlateLabel::player(value["name"].as_str().unwrap_or(key))),
        _ => None,
    }
}

fn quest_card(ui: &mut Ui, images: &mut ProjectImages, content: &Content, key: &str) {
    let Some(quest) = content.by_key::<QuestDef>(key) else {
        return;
    };
    if !content.has_built::<RiftScripts>() {
        return;
    }
    let parties = Parties::of(content, content.built::<RiftScripts>());
    let width = ui.available_width();
    let look = QuestCardLook {
        width: width.min(card::DOCKED_WIDTH),
        max_height: card::MAX_HEIGHT,
        moment: Some(Moment::Offer),
    };
    ui.vertical(|ui| {
        ui.set_width(width);
        quest::card::show(ui, images, content, quest, look, |ui, images| {
            quest::card::offer(ui, images, content, &parties, quest, None);
        });
    });
}

fn item_card(ui: &mut Ui, images: &mut ProjectImages, content: &Content, key: &str) {
    let Some(item) = content.by_key::<ItemDef>(key) else {
        return;
    };
    let def = item.get(content);
    let art = images.image(&def.icon).map(|image| image.texture);
    let look = CardLook {
        width: ui.available_width().min(card::WIDTH),
        closable: false,
        ..CardLook::PINNED
    };
    item::card::face_of(def, art, look).show(ui, |ui, plate| {
        item::card::summary(ui, content, item, plate);
        item::card::details(ui, content, item, |_| None);
        item::card::grant_lines(ui, images, content, item);
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
        if module.script_kind().is_none() {
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
