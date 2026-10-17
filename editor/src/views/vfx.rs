use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use bevy::camera::visibility::RenderLayers;
use bevy::camera::{ClearColorConfig, RenderTarget};
use bevy::prelude::*;
use bevy::shader::Shader;
use bevy::sprite_render::MeshMaterial2d;
use bevy_egui::EguiUserTextures;
use egui::{Color32, FontId, Pos2, Stroke, Ui, Vec2 as EVec2};
use engine::core::geometry::{Degrees, Footprint, Shape};
use engine::core::math::{FrameSize, Pos, Rgba};
use engine::core::render::{TILE, ToScreen};
use engine::core::tiling::Tiles;
use engine::core::time::Seconds;
use engine::core::vfx::render::{
    self as vfx_render, SITE_ACTOR, SITE_AREA, SITE_SCREEN, SiteUniform, VfxMaterial, quad_overscan,
};
use engine::core::vfx::{
    ParamFill, ParamKind, ParamValue, Play, ShaderError, SpriteAnchor, VfxDef, VfxParams,
    VfxShaderDef, shader_file,
};
use serde::Deserialize;
use serde_json::Value;

use crate::app::Editor;
use crate::drafts::{clear_draft, draft_or, set_draft};
use crate::forms::{self, FormChange, FormCx};
use crate::project::{ContentEdit, ProjectFiles, row_file};
use crate::ui::{inspector, theme, widgets};
use crate::views::area::scene;
use crate::views::{model, shader_code};

pub const TABLE: &str = "vfx";
pub const SHADER_TABLE: &str = "vfx_shader";

const FORM_WIDTH: f32 = 440.0;
const PREVIEW: [u32; 2] = [384, 288];
const ZOOM: f32 = 2.0;
const PREVIEW_LAYER: usize = 31;
const REST_BETWEEN_PLAYS: f32 = 0.5;
const CODE_FOOTER: f32 = 40.0;
const COLUMN_GAP: f32 = 16.0;
const MIN_CODE_WIDTH: f32 = 260.0;
const MIN_PREVIEW_WIDTH: f32 = 220.0;
const SLIDER_SURROUND: f32 = 130.0;
const HEADING_HEIGHT: f32 = 24.0;
const MIN_TITLE_WIDTH: f32 = 60.0;
const KEPT_SHADERS: usize = 64;
const PARAM_INDENT: f32 = 22.0;
const BOUND_WIDTH: f32 = 64.0;
const BACKDROP_SCENE: &str = "vfx-preview";

/// The vfx previews: what the open row asked to see this frame, and the stage that renders it.
pub struct VfxViews {
    pub target: Target,
    pub background: bool,
    started: Option<(String, f64)>,
    pub fills: HashMap<String, BTreeMap<String, ParamValue>>,
    request: Option<PreviewRequest>,
    overlays: Vec<Overlay>,
    problems: Vec<String>,
    stage: Option<Stage>,
}

impl Default for VfxViews {
    fn default() -> VfxViews {
        VfxViews {
            target: Target::default(),
            background: true,
            started: None,
            fills: HashMap::new(),
            request: None,
            overlays: Vec::new(),
            problems: Vec::new(),
            stage: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Target {
    Actor { model: String },
    Area { shape: Shape, facing: Degrees },
    Screen,
}

impl Default for Target {
    fn default() -> Target {
        Target::Actor {
            model: String::new(),
        }
    }
}

pub fn show_vfx(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(row) = editor.row_value(TABLE, key) else {
        ui.label(theme::muted(format!("{} is gone", row_file(TABLE, key))));
        return;
    };
    let layers = layers_of(&row);
    let tunables: Vec<Tunable> = row["params"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|param| {
            let (kind, default) = match param["kind"].as_str()? {
                "color" => (ParamKind::Color, ParamValue::Color(Rgba::WHITE)),
                "bool" => (ParamKind::Bool, ParamValue::Bool(false)),
                _ => (ParamKind::Number, ParamValue::Number(1.0)),
            };
            Some(Tunable {
                name: param["name"].as_str()?.to_owned(),
                kind,
                default,
                range: None,
            })
        })
        .collect();
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(FORM_WIDTH);
            egui::ScrollArea::vertical()
                .id_salt(("vfx-form", key))
                .auto_shrink([false, false])
                .show(ui, |ui| inspector::show_row(editor, ui, TABLE, key));
        });
        ui.add_space(16.0);
        ui.vertical(|ui| {
            widgets::section(ui, "preview");
            preview(
                editor,
                ui,
                &format!("{TABLE}/{key}"),
                layers,
                &tunables,
                &[],
            );
        });
    });
}

pub fn show_shader(editor: &mut Editor, ui: &mut Ui, key: &str) {
    let Some(row) = editor.row_value(SHADER_TABLE, key) else {
        ui.label(theme::muted(format!(
            "{} is gone",
            row_file(SHADER_TABLE, key)
        )));
        return;
    };
    let def: Option<VfxShaderDef> = serde_json::from_value(row.clone()).ok();
    let file = shader_file(key);
    let current = editor
        .project
        .as_ref()
        .and_then(|project| project.files.text(&file))
        .unwrap_or_default();
    let code_id = egui::Id::new(("shader-code", key));
    let draft = draft_or(ui, code_id, current.clone());
    let room = ui.available_width() - 2.0 * COLUMN_GAP;
    let preview_width =
        (room - FORM_WIDTH - MIN_CODE_WIDTH).clamp(MIN_PREVIEW_WIDTH, PREVIEW[0] as f32);
    let code_width = (room - FORM_WIDTH - preview_width).max(MIN_CODE_WIDTH);
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(FORM_WIDTH);
            egui::ScrollArea::vertical()
                .id_salt(("shader-form", key))
                .auto_shrink([false, false])
                .show(ui, |ui| inspector::show_row(editor, ui, SHADER_TABLE, key));
        });
        ui.add_space(COLUMN_GAP);
        ui.vertical(|ui| {
            ui.set_width(code_width);
            match def.as_ref() {
                Some(def) => {
                    code_pane(
                        editor,
                        ui,
                        code_id,
                        def,
                        key,
                        &file,
                        &current,
                        draft.clone(),
                    );
                }
                None => {
                    widgets::section(ui, &format!("code · {file}"));
                    ui.label(theme::warn("the row does not parse as a shader yet"));
                }
            }
        });
        ui.add_space(COLUMN_GAP);
        ui.vertical(|ui| {
            ui.set_width(preview_width);
            widgets::section(ui, "preview");
            let Some(def) = def.as_ref() else {
                return;
            };
            let layer = Layer::Shader {
                shader: key.to_owned(),
                params: def
                    .params
                    .iter()
                    .map(|param| {
                        let fill = ParamFill::Param {
                            param: param.name.clone(),
                        };
                        (param.name.clone(), fill)
                    })
                    .collect(),
                duration: Seconds(1.0),
                delay: Seconds(0.0),
            };
            let tunables: Vec<Tunable> = def
                .params
                .iter()
                .map(|param| Tunable {
                    name: param.name.clone(),
                    kind: param.kind,
                    default: param.default,
                    range: param.range(),
                })
                .collect();
            let drafts = [(key.to_owned(), draft)];
            preview(
                editor,
                ui,
                &format!("{SHADER_TABLE}/{key}"),
                vec![layer],
                &tunables,
                &drafts,
            );
        });
    });
}

/// A parameter the preview lets the designer play with: the value it starts at, and for a number
/// with a range, the slider's bounds.
struct Tunable {
    name: String,
    kind: ParamKind,
    default: ParamValue,
    range: Option<(f32, f32)>,
}

/// The parameters a shader declares: a name, a kind, the default a layer that leaves it unfilled
/// gets and, for a number, the range it is meant to be set within.
pub fn shader_params(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> FormChange {
    let mut changed = FormChange::default();
    if !value["params"].is_array() {
        value["params"] = Value::Array(Vec::new());
    }
    let count = value["params"].as_array().map_or(0, Vec::len);
    widgets::section_count(ui, "parameters", count);
    let mut remove = None;
    for index in 0..count {
        let path = format!("/params/{index}");
        let param = &mut value["params"][index];
        let kind = param["kind"].as_str().unwrap_or("number").to_owned();
        ui.horizontal(|ui| {
            if ui
                .add(egui::Label::new(theme::faint("×")).sense(egui::Sense::click()))
                .on_hover_text("Remove")
                .clicked()
            {
                remove = Some(index);
            }
            ui.scope(|ui| {
                ui.set_width(120.0);
                changed |= forms::text(ui, cx, &mut param["name"], &format!("{path}/name"));
            });
            let mut picked = kind.clone();
            widgets::combo_box(("param-kind", index))
                .width(90.0)
                .selected_text(theme::mono(&kind).size(13.0))
                .show_ui(ui, |ui| {
                    for kind in ["number", "bool", "color"] {
                        ui.selectable_value(&mut picked, kind.to_owned(), kind);
                    }
                });
            if picked != kind {
                param["kind"] = Value::String(picked.clone());
                let fields = param.as_object_mut().expect("object");
                fields.remove("min");
                fields.remove("max");
                match picked.as_str() {
                    "color" => {
                        fields.insert(
                            "default".to_owned(),
                            serde_json::json!([255, 255, 255, 255]),
                        );
                    }
                    "bool" => {
                        fields.insert("default".to_owned(), Value::Bool(false));
                    }
                    _ => {
                        fields.insert("default".to_owned(), Value::from(0.0));
                        fields.insert("min".to_owned(), Value::from(0.0));
                        fields.insert("max".to_owned(), Value::from(1.0));
                    }
                }
                changed = FormChange::at(&path);
            }
            match picked.as_str() {
                "color" => {
                    changed |= forms::color(ui, &mut param["default"], &format!("{path}/default"));
                }
                "bool" => {
                    let mut flag = param["default"].as_bool().unwrap_or(false);
                    if ui.checkbox(&mut flag, "").changed() {
                        param["default"] = Value::Bool(flag);
                        changed |= FormChange::at(&format!("{path}/default"));
                    }
                }
                _ => {}
            }
        });
        if kind == "number" {
            changed |= number_param_fields(ui, cx, param, &path);
        }
    }
    if let Some(index) = remove {
        value["params"].as_array_mut().expect("array").remove(index);
        changed = FormChange::at("/params");
    }
    if ui.button("+ parameter").clicked() {
        value["params"]
            .as_array_mut()
            .expect("array")
            .push(serde_json::json!({
                "name": "amount", "kind": "number", "default": 1.0, "min": 0.0, "max": 2.0
            }));
        changed = FormChange::at("/params");
    }
    if value["params"].as_array().is_some_and(Vec::is_empty) {
        value.as_object_mut().expect("object").remove("params");
    }
    changed
}

fn number_param_fields(ui: &mut Ui, cx: &mut FormCx, param: &mut Value, path: &str) -> FormChange {
    let mut changed = FormChange::default();
    let schema = serde_json::json!({ "type": "number" });
    ui.horizontal(|ui| {
        ui.add_space(PARAM_INDENT);
        for bound in ["min", "max"] {
            ui.label(theme::faint(bound).size(12.0));
            ui.scope(|ui| {
                ui.set_width(BOUND_WIDTH);
                changed |= forms::number(
                    ui,
                    cx,
                    &schema,
                    &mut param[bound],
                    &format!("{path}/{bound}"),
                    false,
                );
            });
        }
        ui.label(theme::faint("default").size(12.0));
        let range = param["min"]
            .as_f64()
            .zip(param["max"].as_f64())
            .filter(|(min, max)| min < max);
        let mut amount = param["default"].as_f64().unwrap_or_default();
        let moved = match range {
            Some((min, max)) => design_tokens::widgets::slider(
                ui,
                egui::Slider::new(&mut amount, min..=max).show_value(true),
            )
            .changed(),
            None => ui
                .add(egui::DragValue::new(&mut amount).speed(0.01))
                .changed(),
        };
        if moved {
            param["default"] = Value::from(tidy(amount));
            changed |= FormChange::at(&format!("{path}/default"));
        }
    });
    changed
}

/// A slider's position as a number worth writing into a row: four decimals, no float noise.
fn tidy(number: f64) -> f64 {
    (number * 10_000.0).round() / 10_000.0
}

/// Renders the requested preview into its image, so the next frame's panel shows it.
pub fn sync(editor: &mut Editor, world: &mut World) {
    let request = editor.views.vfx.request.take();
    let Some(request) = request else {
        if let Some(stage) = editor.views.vfx.stage.take() {
            stage.despawn(world);
        }
        return;
    };
    let Some(project) = editor.project.as_ref() else {
        return;
    };
    let files = project.files.clone();
    let Editor { views, .. } = editor;
    let stage = views.vfx.stage.get_or_insert_with(|| Stage::spawn(world));
    if stage.signature != request.signature {
        stage.clear_pieces(world);
        stage.signature = request.signature.clone();
        stage.pieces = request
            .layers
            .iter()
            .map(|layer| stage.spawn_piece(world, layer, &mut views.area.scenes, &files))
            .collect();
        stage.target = spawn_target(world, &request.target, &mut views.area.scenes, &files);
    }
    let behind = views
        .area
        .scenes
        .by_key
        .get(BACKDROP_SCENE)
        .filter(|_| views.vfx.background)
        .map(|scene| (scene.image.clone(), scene.uv(), scene.alloc));
    let Some(frame) = site_frame(world, &request.target, stage.target, behind) else {
        return;
    };
    views.vfx.overlays.clear();
    views.vfx.problems.clear();
    let given = VfxParams(request.fills.iter().map(|(k, v)| (k.clone(), *v)).collect());
    for (index, layer) in request.layers.iter().enumerate() {
        let local = Seconds(request.elapsed - layer.delay().0);
        let active = local.0 >= 0.0 && local.0 <= layer.duration().0;
        if let Layer::Text {
            template,
            color,
            size,
            rise,
            duration,
            ..
        } = layer
        {
            if active {
                let progress = (local.0 / duration.0.max(0.001)).clamp(0.0, 1.0);
                let risen = frame.center.y + frame.size.y / 2.0 + rise.0 * TILE.0 * ease(progress);
                views.vfx.overlays.push(Overlay {
                    text: VfxDef::fill(template, &given),
                    color: *color,
                    size: *size,
                    at: Vec2::new(frame.center.x, risen),
                    alpha: 1.0 - ((progress - 0.6) / 0.4).clamp(0.0, 1.0),
                });
            }
            continue;
        }
        let Some(piece) = stage.pieces.get(index).copied().flatten() else {
            continue;
        };
        if !active {
            set_visible(world, piece, false);
            continue;
        }
        match layer {
            Layer::Sprite {
                frame: cell,
                frames,
                fps,
                anchor,
                scale,
                play,
                ..
            } => {
                let sheet = world
                    .get::<Sprite>(piece)
                    .and_then(|sprite| world.resource::<Assets<Image>>().get(&sprite.image))
                    .map(Image::size_f32);
                let Some(sheet) = sheet else {
                    set_visible(world, piece, false);
                    continue;
                };
                let cell = Vec2::new(cell.width as f32, cell.height as f32);
                let index = (local.0 * fps) as u32;
                let index = match play {
                    Play::Once if index >= *frames => {
                        set_visible(world, piece, false);
                        continue;
                    }
                    Play::Once => index,
                    Play::Loop { .. } => index % (*frames).max(1),
                };
                let columns = ((sheet.x / cell.x) as u32).max(1);
                let min = Vec2::new(
                    (index % columns) as f32 * cell.x,
                    (index / columns) as f32 * cell.y,
                );
                let drawn = cell * *scale;
                let at = match anchor {
                    SpriteAnchor::Center => frame.center,
                    SpriteAnchor::Feet => {
                        frame.center + Vec2::new(0.0, (drawn.y - frame.size.y) / 2.0)
                    }
                    SpriteAnchor::Head => {
                        frame.center + Vec2::new(0.0, (drawn.y + frame.size.y) / 2.0)
                    }
                };
                let mut entity = world.entity_mut(piece);
                if let Some(mut sprite) = entity.get_mut::<Sprite>() {
                    sprite.rect = Some(Rect::from_corners(min, min + cell));
                    sprite.custom_size = Some(drawn);
                }
                if let Some(mut transform) = entity.get_mut::<Transform>() {
                    transform.translation = Vec3::new(at.x, at.y, 2.0 + index as f32 * 0.01);
                }
                set_visible(world, piece, true);
            }
            Layer::Shader {
                shader,
                params,
                duration,
                ..
            } => {
                let shown = show_shader_piece(
                    world,
                    stage,
                    piece,
                    &frame,
                    shader,
                    params,
                    &given,
                    local,
                    *duration,
                    request.elapsed,
                    &request.drafts,
                    &files,
                    &mut views.vfx.problems,
                );
                set_visible(world, piece, shown);
                if shown && let Some(target) = stage.target {
                    set_alpha(world, target, 0.0);
                }
            }
            Layer::Text { .. } => {}
        }
    }
    let overdrawn = request.layers.iter().enumerate().any(|(index, layer)| {
        matches!(layer, Layer::Shader { .. })
            && stage
                .pieces
                .get(index)
                .copied()
                .flatten()
                .is_some_and(|piece| {
                    world
                        .get::<Visibility>(piece)
                        .is_some_and(|visibility| *visibility == Visibility::Inherited)
                })
    });
    if !overdrawn && let Some(target) = stage.target {
        set_alpha(world, target, 1.0);
    }
}

fn preview(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    layers: Vec<Layer>,
    tunables: &[Tunable],
    drafts: &[(String, String)],
) {
    let models: Vec<String> = editor
        .project
        .as_ref()
        .map(|project| project.files.keys_of("model").map(str::to_owned).collect())
        .unwrap_or_default();
    let total = layers
        .iter()
        .map(|layer| layer.delay().0 + layer.duration().0)
        .fold(0.5_f32, f32::max);
    let now = ui.input(|input| input.time);
    let views = &mut editor.views.vfx;
    if let Target::Actor { model } = &mut views.target
        && model.is_empty()
        && let Some(first) = models.first()
    {
        *model = first.clone();
    }
    ui.horizontal(|ui| {
        for (label, on) in [
            ("actor", matches!(views.target, Target::Actor { .. })),
            ("area", matches!(views.target, Target::Area { .. })),
            ("screen", views.target == Target::Screen),
        ] {
            if widgets::mode_chip(ui, label, on).clicked() && !on {
                views.target = match label {
                    "actor" => Target::Actor {
                        model: models.first().cloned().unwrap_or_default(),
                    },
                    "area" => Target::Area {
                        shape: Shape::Circle { radius: Tiles(1.5) },
                        facing: Degrees(0.0),
                    },
                    _ => Target::Screen,
                };
            }
        }
    });
    ui.horizontal(|ui| match &mut views.target {
        Target::Actor { model } => {
            widgets::combo_box("preview-model")
                .width(160.0)
                .selected_text(theme::mono(model.as_str()).size(13.0))
                .show_ui(ui, |ui| {
                    for candidate in &models {
                        ui.selectable_value(model, candidate.clone(), candidate);
                    }
                });
        }
        Target::Area { shape, facing } => {
            shape_fields(ui, shape);
            ui.add(
                egui::DragValue::new(&mut facing.0)
                    .range(0.0..=360.0)
                    .suffix("°"),
            );
        }
        Target::Screen => {}
    });
    let started = match &views.started {
        Some((playing, started)) if playing == key => *started,
        _ => {
            views.started = Some((key.to_owned(), now));
            now
        }
    };
    let elapsed = ((now - started) as f32)
        .rem_euclid(total + REST_BETWEEN_PLAYS)
        .min(total);
    ui.ctx().request_repaint();
    ui.horizontal(|ui| {
        ui.checkbox(&mut views.background, "background");
        ui.label(theme::faint(format!("{elapsed:.2} s of {total:.2}")).size(12.0));
    });
    let fills = views.fills.entry(key.to_owned()).or_default();
    for tunable in tunables {
        fills.entry(tunable.name.clone()).or_insert(tunable.default);
    }
    if !tunables.is_empty() && ui.button("reset to defaults").clicked() {
        for tunable in tunables {
            fills.insert(tunable.name.clone(), tunable.default);
        }
    }
    ui.spacing_mut().slider_width = (ui.available_width() - SLIDER_SURROUND).max(60.0);
    for tunable in tunables {
        let name = &tunable.name;
        ui.horizontal(|ui| {
            ui.label(theme::muted(name).monospace().size(12.5));
            match tunable.kind {
                ParamKind::Bool => {
                    let mut flag = matches!(fills.get(name), Some(ParamValue::Bool(true)));
                    if ui.checkbox(&mut flag, "").changed() {
                        fills.insert(name.clone(), ParamValue::Bool(flag));
                    }
                }
                ParamKind::Number => {
                    let mut amount = match fills.get(name) {
                        Some(ParamValue::Number(number)) => *number,
                        _ => 1.0,
                    };
                    let moved = match tunable.range {
                        Some((min, max)) => design_tokens::widgets::slider(
                            ui,
                            egui::Slider::new(&mut amount, min..=max),
                        )
                        .changed(),
                        None => ui
                            .add(egui::DragValue::new(&mut amount).speed(0.01))
                            .changed(),
                    };
                    if moved {
                        fills.insert(name.clone(), ParamValue::Number(amount));
                    }
                }
                ParamKind::Color => {
                    let held = match fills.get(name) {
                        Some(ParamValue::Color(color)) => *color,
                        _ => Rgba::WHITE,
                    };
                    let [r, g, b, a] = held.0.to_be_bytes();
                    let mut color = Color32::from_rgba_unmultiplied(r, g, b, a);
                    if ui.color_edit_button_srgba(&mut color).changed() {
                        let [r, g, b, a] = color.to_srgba_unmultiplied();
                        fills.insert(name.clone(), ParamValue::Color(Rgba::from([r, g, b, a])));
                    }
                }
            }
        });
    }
    let fills = fills.clone();
    let background = views.background;
    let fit = (ui.available_width() / PREVIEW[0] as f32).min(1.0);
    let size = EVec2::new(PREVIEW[0] as f32, PREVIEW[1] as f32) * fit;
    let zoom = ZOOM * fit;
    let (rect, _) = ui.allocate_exact_size(size, egui::Sense::hover());
    if background {
        model::preview::backdrop(editor, ui.painter(), rect, BACKDROP_SCENE.to_owned(), zoom);
    } else {
        ui.painter().rect_filled(rect, 4.0, theme::CANVAS);
    }
    let views = &mut editor.views.vfx;
    if let Some(stage) = &views.stage {
        ui.painter().image(
            stage.texture,
            rect,
            egui::Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
            Color32::WHITE,
        );
    }
    let to_image =
        |at: Vec2| rect.min + EVec2::new(at.x * zoom + size.x / 2.0, -at.y * zoom + size.y / 2.0);
    if let Target::Area { shape, facing } = &views.target {
        let outline: Vec<Pos2> = Footprint {
            at: Pos::new(0.0, 0.0),
            facing: facing.radians(),
            shape: *shape,
        }
        .outline(32)
        .into_iter()
        .map(|point| to_image(point.to_screen()))
        .collect();
        if let (Some(first), true) = (outline.first().copied(), outline.len() > 1) {
            let mut closed = outline.clone();
            closed.push(first);
            ui.painter().add(egui::Shape::dashed_line(
                &closed,
                Stroke::new(1.0, theme::WARN),
                4.0,
                3.0,
            ));
        }
    }
    for overlay in &views.overlays {
        let at = to_image(overlay.at);
        let [r, g, b, _] = overlay.color.0.to_be_bytes();
        let ink = Color32::from_rgba_unmultiplied(r, g, b, (overlay.alpha * 255.0) as u8);
        ui.painter().text(
            at,
            egui::Align2::CENTER_BOTTOM,
            &overlay.text,
            FontId::proportional(overlay.size * zoom),
            ink,
        );
    }
    for problem in &views.problems {
        ui.label(theme::warn(problem));
    }
    let signature = format!(
        "{key}|{}|{:?}",
        serde_json::to_string(&layers_signature(&layers)).unwrap_or_default(),
        views.target
    );
    views.request = Some(PreviewRequest {
        layers,
        target: views.target.clone(),
        elapsed,
        fills,
        drafts: drafts.iter().cloned().collect(),
        signature,
    });
}

fn shape_fields(ui: &mut Ui, shape: &mut Shape) {
    let kinds = ["circle", "rect", "cone", "line"];
    let current = match shape {
        Shape::Circle { .. } => "circle",
        Shape::Rect { .. } => "rect",
        Shape::Cone { .. } => "cone",
        Shape::Line { .. } => "line",
    };
    let mut picked = current;
    widgets::combo_box("preview-shape")
        .width(80.0)
        .selected_text(theme::mono(current).size(13.0))
        .show_ui(ui, |ui| {
            for kind in kinds {
                ui.selectable_value(&mut picked, kind, kind);
            }
        });
    if picked != current {
        *shape = match picked {
            "rect" => Shape::Rect {
                width: Tiles(3.0),
                height: Tiles(2.0),
            },
            "cone" => Shape::Cone {
                angle: Degrees(90.0),
                length: Tiles(2.5),
            },
            "line" => Shape::Line {
                length: Tiles(4.0),
                width: Tiles(1.0),
            },
            _ => Shape::Circle { radius: Tiles(1.5) },
        };
    }
    let tiles = |ui: &mut Ui, label: &str, value: &mut Tiles| {
        ui.label(theme::faint(label).size(12.0));
        ui.add(
            egui::DragValue::new(&mut value.0)
                .speed(0.1)
                .range(0.1..=12.0)
                .fixed_decimals(1),
        );
    };
    match shape {
        Shape::Circle { radius } => tiles(ui, "radius", radius),
        Shape::Rect { width, height } => {
            tiles(ui, "width", width);
            tiles(ui, "height", height);
        }
        Shape::Cone { angle, length } => {
            ui.label(theme::faint("angle").size(12.0));
            ui.add(
                egui::DragValue::new(&mut angle.0)
                    .range(5.0..=360.0)
                    .suffix("°"),
            );
            tiles(ui, "length", length);
        }
        Shape::Line { length, width } => {
            tiles(ui, "length", length);
            tiles(ui, "width", width);
        }
    }
}

#[expect(
    clippy::too_many_arguments,
    reason = "one shader's code as it stands, read once"
)]
fn code_pane(
    editor: &mut Editor,
    ui: &mut Ui,
    id: egui::Id,
    def: &VfxShaderDef,
    key: &str,
    file: &str,
    current: &str,
    mut draft: String,
) {
    let heading_slot = ui.available_rect_before_wrap();
    ui.add_space(HEADING_HEIGHT);
    let height = ui.available_height() - CODE_FOOTER;
    let (response, verdict) = shader_code::show(ui, id, &mut draft, def, height);
    if response.changed() {
        set_draft(ui, id, &draft);
    }
    let status = match &verdict {
        Ok(()) => theme::ok("✓ compiles"),
        Err(error) => {
            let place = error
                .line
                .map(|(line, column)| format!("line {line}:{column} · "))
                .unwrap_or_default();
            theme::warn(format!("✗ {place}{}", error.message))
        }
    };
    let heading = egui::Rect::from_min_size(
        heading_slot.min,
        EVec2::new(heading_slot.width(), HEADING_HEIGHT),
    );
    ui.scope_builder(
        egui::UiBuilder::new()
            .max_rect(heading)
            .layout(egui::Layout::left_to_right(egui::Align::Center)),
        |ui| {
            let status = status.size(11.0);
            let status_width = ui.fonts_mut(|fonts| {
                fonts
                    .layout_no_wrap(
                        status.text().to_owned(),
                        FontId::proportional(11.0),
                        Color32::WHITE,
                    )
                    .size()
                    .x
            });
            let title_room = ui.available_width() - status_width - ui.spacing().item_spacing.x;
            ui.scope(|ui| {
                ui.set_max_width(title_room.max(MIN_TITLE_WIDTH));
                ui.add(
                    egui::Label::new(widgets::section_heading(&format!("code · {file} · ")))
                        .truncate(),
                );
            });
            ui.add(egui::Label::new(status).truncate());
        },
    );
    let dirty = draft != current;
    if !dirty {
        return;
    }
    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
        let apply = widgets::primary(ui, "Apply").clicked();
        if ui.button("Revert").clicked() {
            clear_draft(ui, id);
        }
        if apply || (response.lost_focus() && verdict.is_ok()) {
            let mut edit = ContentEdit::new(format!("Edit shader {key}")).merging();
            edit.write(file.to_owned(), Arc::from(draft.as_bytes()));
            if editor.apply(edit) {
                clear_draft(ui, id);
            }
        }
    });
}

#[derive(Clone, Deserialize, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Layer {
    Sprite {
        sheet: String,
        frame: FrameSize,
        frames: u32,
        fps: f32,
        #[serde(default)]
        anchor: SpriteAnchor,
        #[serde(default = "one")]
        scale: f32,
        #[serde(default)]
        play: Play,
        #[serde(default)]
        delay: Seconds,
    },
    Text {
        template: String,
        color: Rgba,
        #[serde(default = "text_size")]
        size: f32,
        #[serde(default = "text_rise")]
        rise: Tiles,
        duration: Seconds,
        #[serde(default)]
        delay: Seconds,
    },
    Shader {
        shader: String,
        #[serde(default)]
        params: BTreeMap<String, ParamFill>,
        duration: Seconds,
        #[serde(default)]
        delay: Seconds,
    },
}

impl Layer {
    fn delay(&self) -> Seconds {
        match self {
            Layer::Sprite { delay, .. }
            | Layer::Text { delay, .. }
            | Layer::Shader { delay, .. } => *delay,
        }
    }

    fn duration(&self) -> Seconds {
        match self {
            Layer::Sprite {
                frames, fps, play, ..
            } => match play {
                Play::Once => Seconds(*frames as f32 / fps.max(0.001)),
                Play::Loop { seconds } => *seconds,
            },
            Layer::Text { duration, .. } | Layer::Shader { duration, .. } => *duration,
        }
    }
}

struct PreviewRequest {
    layers: Vec<Layer>,
    target: Target,
    elapsed: f32,
    fills: BTreeMap<String, ParamValue>,
    drafts: HashMap<String, String>,
    signature: String,
}

struct Overlay {
    text: String,
    color: Rgba,
    size: f32,
    at: Vec2,
    alpha: f32,
}

struct Stage {
    camera: Entity,
    image: Handle<Image>,
    texture: egui::TextureId,
    quad: Handle<Mesh>,
    blank: Handle<Image>,
    target: Option<Entity>,
    pieces: Vec<Option<Entity>>,
    shaders: HashMap<String, Result<Handle<Shader>, ShaderError>>,
    signature: String,
}

struct SiteFrame {
    kind: u32,
    center: Vec2,
    size: Vec2,
    facing: f32,
    texture: Option<(Handle<Image>, Rect, Vec2)>,
    area: vfx_render::AreaShape,
}

impl Stage {
    fn spawn(world: &mut World) -> Stage {
        let (image, texture) = scene::render_target(world, PREVIEW);
        let camera = world
            .spawn((
                Camera2d,
                RenderTarget::Image(image.clone().into()),
                Camera {
                    order: -50,
                    clear_color: ClearColorConfig::Custom(Color::NONE),
                    ..default()
                },
                Projection::Orthographic(OrthographicProjection {
                    scale: 1.0 / ZOOM,
                    ..OrthographicProjection::default_2d()
                }),
                Transform::default(),
                RenderLayers::layer(PREVIEW_LAYER),
            ))
            .id();
        let quad = world
            .resource_mut::<Assets<Mesh>>()
            .add(Rectangle::new(1.0, 1.0));
        let blank = world.resource_mut::<Assets<Image>>().add(Image::new_fill(
            bevy::render::render_resource::Extent3d::default(),
            bevy::render::render_resource::TextureDimension::D2,
            &[0, 0, 0, 0],
            bevy::render::render_resource::TextureFormat::Rgba8UnormSrgb,
            bevy::asset::RenderAssetUsages::default(),
        ));
        Stage {
            camera,
            image,
            texture,
            quad,
            blank,
            target: None,
            pieces: Vec::new(),
            shaders: HashMap::new(),
            signature: String::new(),
        }
    }

    fn spawn_piece(
        &self,
        world: &mut World,
        layer: &Layer,
        scenes: &mut scene::AreaScenes,
        files: &ProjectFiles,
    ) -> Option<Entity> {
        match layer {
            Layer::Sprite { sheet, .. } => {
                let image = scene::image_handle(scenes, files, sheet, world);
                Some(
                    world
                        .spawn((
                            Sprite { image, ..default() },
                            Transform::default(),
                            Visibility::Hidden,
                            RenderLayers::layer(PREVIEW_LAYER),
                        ))
                        .id(),
                )
            }
            Layer::Shader { .. } => {
                let material = world
                    .resource_mut::<Assets<VfxMaterial>>()
                    .add(VfxMaterial {
                        image: self.blank.clone(),
                        site: SiteUniform::default(),
                        params: default(),
                        shader: Handle::default(),
                    });
                Some(
                    world
                        .spawn((
                            Mesh2d(self.quad.clone()),
                            MeshMaterial2d(material),
                            Transform::default(),
                            Visibility::Hidden,
                            RenderLayers::layer(PREVIEW_LAYER),
                        ))
                        .id(),
                )
            }
            Layer::Text { .. } => None,
        }
    }

    fn clear_pieces(&mut self, world: &mut World) {
        for piece in self.pieces.drain(..).flatten() {
            world.despawn(piece);
        }
        if let Some(target) = self.target.take() {
            world.despawn(target);
        }
    }

    fn despawn(mut self, world: &mut World) {
        self.clear_pieces(world);
        world.despawn(self.camera);
        world
            .resource_mut::<EguiUserTextures>()
            .remove_image(&self.image);
    }
}

fn spawn_target(
    world: &mut World,
    target: &Target,
    scenes: &mut scene::AreaScenes,
    files: &ProjectFiles,
) -> Option<Entity> {
    let Target::Actor { model } = target else {
        return None;
    };
    let row = files.json(&row_file("model", model))?;
    let path = row["sprites"]["image"].as_str()?.to_owned();
    let image = scene::image_handle(scenes, files, &path, world);
    let sheet = world.resource::<Assets<Image>>().get(&image)?.size_f32();
    let cell = Vec2::new(
        row["sprites"]["frame_size"]["width"]
            .as_f64()
            .unwrap_or(16.0) as f32,
        row["sprites"]["frame_size"]["height"]
            .as_f64()
            .unwrap_or(16.0) as f32,
    );
    let frame = row["sprites"]["actions"]["idle"]["s"][0]["frame"]
        .as_u64()
        .unwrap_or(0) as f32;
    let columns = (sheet.x / cell.x).floor().max(1.0);
    let min = Vec2::new(
        (frame % columns) * cell.x,
        (frame / columns).floor() * cell.y,
    );
    Some(
        world
            .spawn((
                Sprite {
                    image,
                    rect: Some(Rect::from_corners(min, min + cell)),
                    ..default()
                },
                Transform::from_xyz(0.0, 0.0, 1.0),
                RenderLayers::layer(PREVIEW_LAYER),
            ))
            .id(),
    )
}

// The screen site's image is the area drawn behind the preview, so a screen-wide shader has
// something to work on, as it has the frame in the game.
fn site_frame(
    world: &World,
    target: &Target,
    actor: Option<Entity>,
    behind: Option<(Handle<Image>, egui::Rect, [u32; 2])>,
) -> Option<SiteFrame> {
    match target {
        Target::Actor { .. } => {
            let sprite = world.get::<Sprite>(actor?)?;
            let image = world.resource::<Assets<Image>>().get(&sprite.image)?;
            let sheet = image.size_f32();
            let rect = sprite
                .rect
                .unwrap_or_else(|| Rect::from_corners(Vec2::ZERO, sheet));
            Some(SiteFrame {
                kind: SITE_ACTOR,
                center: Vec2::ZERO,
                size: rect.size(),
                facing: 0.0,
                texture: Some((
                    sprite.image.clone(),
                    Rect::from_corners(rect.min / sheet, rect.max / sheet),
                    Vec2::ONE / sheet,
                )),
                area: vfx_render::AreaShape::image(rect.size() / TILE.0),
            })
        }
        Target::Area { shape, facing } => {
            let footprint = Footprint {
                at: Pos::new(0.0, 0.0),
                facing: facing.radians(),
                shape: *shape,
            };
            let (center, size, area) = vfx_render::area_quad(&footprint);
            Some(SiteFrame {
                kind: SITE_AREA,
                center,
                size,
                facing: -facing.radians().0,
                texture: None,
                area,
            })
        }
        Target::Screen => {
            let size = Vec2::new(PREVIEW[0] as f32, PREVIEW[1] as f32) / ZOOM;
            let texture = behind.map(|(image, uv, alloc)| {
                (
                    image,
                    Rect::from_corners(
                        Vec2::new(uv.min.x, uv.min.y),
                        Vec2::new(uv.max.x, uv.max.y),
                    ),
                    Vec2::ONE / Vec2::new(alloc[0] as f32, alloc[1] as f32),
                )
            });
            Some(SiteFrame {
                kind: SITE_SCREEN,
                center: Vec2::ZERO,
                size,
                facing: 0.0,
                texture,
                area: vfx_render::AreaShape::image(size / TILE.0),
            })
        }
    }
}

#[expect(
    clippy::too_many_arguments,
    reason = "one layer's whole state, read once"
)]
fn show_shader_piece(
    world: &mut World,
    stage: &mut Stage,
    piece: Entity,
    frame: &SiteFrame,
    shader: &str,
    fills: &BTreeMap<String, ParamFill>,
    given: &VfxParams,
    local: Seconds,
    duration: Seconds,
    elapsed: f32,
    drafts: &HashMap<String, String>,
    files: &ProjectFiles,
    problems: &mut Vec<String>,
) -> bool {
    let Some(row) = files.json(&row_file(SHADER_TABLE, shader)) else {
        problems.push(format!("no shader row {shader}"));
        return false;
    };
    let Ok(def) = serde_json::from_value::<VfxShaderDef>((*row).clone()) else {
        problems.push(format!("{SHADER_TABLE}/{shader} does not parse"));
        return false;
    };
    let source = drafts
        .get(shader)
        .cloned()
        .or_else(|| files.text(&shader_file(shader)))
        .unwrap_or_default();
    if stage.shaders.len() > KEPT_SHADERS {
        stage.shaders.clear();
    }
    let verdict = stage
        .shaders
        .entry(def.compose(&source))
        .or_insert_with_key(|composed| {
            def.check_source(&source)?;
            let path = format!(
                "vfx_preview/{shader}-{}.wgsl",
                crate::project::hash(composed.as_bytes())
            );
            Ok(world
                .resource_mut::<Assets<Shader>>()
                .add(Shader::from_wgsl(composed.clone(), path)))
        });
    let handle = match verdict {
        Ok(handle) => handle.clone(),
        Err(error) => {
            problems.push(format!("{shader}: {}", error.message));
            return false;
        }
    };
    let Some(material) = world
        .get::<MeshMaterial2d<VfxMaterial>>(piece)
        .map(|material| material.0.clone())
    else {
        return false;
    };
    let overscan = if frame.kind == SITE_SCREEN {
        Vec2::ONE
    } else {
        quad_overscan(frame.size)
    };
    let (image, rect, pixel) = frame.texture.clone().unwrap_or((
        stage.blank.clone(),
        Rect::from_corners(Vec2::ZERO, Vec2::ONE),
        Vec2::ONE,
    ));
    let site = SiteUniform {
        rect: Vec4::new(rect.min.x, rect.min.y, rect.max.x, rect.max.y),
        size: frame.size,
        pixel,
        kind: frame.kind,
        facing: frame.facing,
        progress: (local.0 / duration.0.max(0.001)).clamp(0.0, 1.0),
        time: elapsed,
        overscan,
        shape: frame.area.shape,
        origin: frame.area.origin,
        extent: frame.area.extent,
        tiles: frame.area.tiles,
        ..SiteUniform::default()
    };
    let params = vfx_render::fill_params(&def, fills, given);
    if let Some(mut shown) = world
        .resource_mut::<Assets<VfxMaterial>>()
        .get_mut(&material)
    {
        shown.image = image;
        shown.site = site;
        shown.params = params;
        shown.shader = handle;
    }
    if let Some(mut transform) = world.get_mut::<Transform>(piece) {
        transform.translation = Vec3::new(frame.center.x, frame.center.y, 3.0);
        transform.scale = (frame.size * overscan).extend(1.0);
    }
    true
}

fn set_visible(world: &mut World, entity: Entity, shown: bool) {
    if let Some(mut visibility) = world.get_mut::<Visibility>(entity) {
        visibility.set_if_neq(if shown {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        });
    }
}

fn set_alpha(world: &mut World, entity: Entity, alpha: f32) {
    if let Some(mut sprite) = world.get_mut::<Sprite>(entity)
        && sprite.color.alpha() != alpha
    {
        sprite.color.set_alpha(alpha);
    }
}

fn layers_of(row: &Value) -> Vec<Layer> {
    row["layers"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|layer| serde_json::from_value(layer.clone()).ok())
        .collect()
}

fn layers_signature(layers: &[Layer]) -> Vec<Value> {
    layers
        .iter()
        .map(|layer| serde_json::to_value(layer).unwrap_or(Value::Null))
        .collect()
}

fn ease(progress: f32) -> f32 {
    1.0 - (1.0 - progress) * (1.0 - progress)
}

fn one() -> f32 {
    1.0
}

fn text_size() -> f32 {
    14.0
}

fn text_rise() -> Tiles {
    Tiles(1.0)
}
