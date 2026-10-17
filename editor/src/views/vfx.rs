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
    self as vfx_render, OVERSCAN, SITE_ACTOR, SITE_AREA, SITE_SCREEN, SiteUniform, VfxMaterial,
};
use engine::core::vfx::{
    ParamFill, ParamKind, ParamValue, Play, SpriteAnchor, VfxDef, VfxParams, VfxShaderDef,
};
use serde::Deserialize;
use serde_json::Value;

use crate::app::Editor;
use crate::drafts::{clear_draft, draft_or, set_draft};
use crate::forms::{self, FormChange, FormCx};
use crate::project::{ContentEdit, ProjectFiles, row_file};
use crate::ui::{inspector, theme, widgets};
use crate::views::area::scene;

pub const TABLE: &str = "vfx";
pub const SHADER_TABLE: &str = "vfx_shader";

const FORM_WIDTH: f32 = 440.0;
const PREVIEW: [u32; 2] = [384, 288];
const ZOOM: f32 = 2.0;
const PREVIEW_LAYER: usize = 31;
const REST_BETWEEN_PLAYS: f32 = 0.5;
const CODE_ROWS: usize = 22;

/// The vfx previews: what the open row asked to see this frame, and the stage that renders it.
#[derive(Default)]
pub struct VfxViews {
    pub target: Target,
    pub playing: bool,
    pub started: f64,
    pub scrub: f32,
    pub fills: HashMap<String, BTreeMap<String, ParamValue>>,
    request: Option<PreviewRequest>,
    overlays: Vec<Overlay>,
    problems: Vec<String>,
    stage: Option<Stage>,
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
    let declared: Vec<(String, ParamKind)> = row["params"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|param| {
            let kind = match param["kind"].as_str()? {
                "colour" => ParamKind::Colour,
                _ => ParamKind::Number,
            };
            Some((param["name"].as_str()?.to_owned(), kind))
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
                &declared,
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
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            ui.set_width(FORM_WIDTH);
            egui::ScrollArea::vertical()
                .id_salt(("shader-form", key))
                .auto_shrink([false, false])
                .show(ui, |ui| inspector::show_row(editor, ui, SHADER_TABLE, key));
        });
        ui.add_space(16.0);
        ui.vertical(|ui| {
            let source = row["source"].as_str().unwrap_or_default().to_owned();
            let Some(def) = def else {
                ui.label(theme::warn("the row does not parse as a shader yet"));
                return;
            };
            widgets::section(ui, &format!("code · assets/{source}"));
            let text = code_pane(editor, ui, key, &def, &source);
            widgets::section(ui, "preview");
            let layer = Layer::Shader {
                shader: key.to_owned(),
                params: BTreeMap::new(),
                duration: Seconds(1.0),
                delay: Seconds(0.0),
            };
            let defaults: Vec<(String, ParamKind, ParamValue)> = def
                .params
                .iter()
                .map(|param| (param.name.clone(), param.kind, param.default))
                .collect();
            let declared: Vec<(String, ParamKind)> = defaults
                .iter()
                .map(|(name, kind, _)| (name.clone(), *kind))
                .collect();
            let drafts = [(key.to_owned(), text)];
            preview(
                editor,
                ui,
                &format!("{SHADER_TABLE}/{key}"),
                vec![layer],
                &declared,
                &drafts,
            );
            seed_defaults(editor, &format!("{SHADER_TABLE}/{key}"), &defaults);
        });
    });
}

/// The parameters a shader declares: a name, a kind and the default a layer that leaves it
/// unfilled gets.
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
            let kind = param["kind"].as_str().unwrap_or("number").to_owned();
            let mut picked = kind.clone();
            widgets::combo_box(("param-kind", index))
                .width(90.0)
                .selected_text(theme::mono(&kind).size(13.0))
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut picked, "number".to_owned(), "number");
                    ui.selectable_value(&mut picked, "colour".to_owned(), "colour");
                });
            if picked != kind {
                param["kind"] = Value::String(picked.clone());
                param["default"] = if picked == "colour" {
                    serde_json::json!([255, 255, 255, 255])
                } else {
                    Value::from(0.0)
                };
                changed = FormChange::at(&path);
            }
            if picked == "colour" {
                changed |= forms::color(ui, &mut param["default"], &format!("{path}/default"));
            } else {
                let schema = serde_json::json!({ "type": "number" });
                changed |= forms::number(
                    ui,
                    cx,
                    &schema,
                    &mut param["default"],
                    &format!("{path}/default"),
                    false,
                );
            }
        });
    }
    if let Some(index) = remove {
        value["params"].as_array_mut().expect("array").remove(index);
        changed = FormChange::at("/params");
    }
    if ui.button("+ parameter").clicked() {
        value["params"]
            .as_array_mut()
            .expect("array")
            .push(serde_json::json!({ "name": "amount", "kind": "number", "default": 1.0 }));
        changed = FormChange::at("/params");
    }
    if value["params"].as_array().is_some_and(Vec::is_empty) {
        value.as_object_mut().expect("object").remove("params");
    }
    changed
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
    let Some(frame) = site_frame(world, &request.target, stage.target) else {
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
            colour,
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
                    colour: *colour,
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
    declared: &[(String, ParamKind)],
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
        match &mut views.target {
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
        }
    });
    ui.horizontal(|ui| {
        let label = if views.playing { "⏸" } else { "▶" };
        if ui.button(label).clicked() {
            views.playing = !views.playing;
            views.started = now;
        }
        let period = total + REST_BETWEEN_PLAYS;
        let elapsed = if views.playing {
            ((now - views.started) as f32).rem_euclid(period)
        } else {
            views.scrub * total
        };
        if views.playing {
            views.scrub = (elapsed / total).min(1.0);
            ui.ctx().request_repaint();
        }
        let mut scrub = views.scrub;
        let label = format!("{:.2} s of {total:.2}", scrub * total);
        if design_tokens::widgets::slider(
            ui,
            egui::Slider::new(&mut scrub, 0.0..=1.0)
                .show_value(false)
                .text(label),
        )
        .changed()
        {
            views.playing = false;
            views.scrub = scrub;
        }
    });
    let fills = views.fills.entry(key.to_owned()).or_default();
    for (name, kind) in declared {
        fills.entry(name.clone()).or_insert(match kind {
            ParamKind::Number => ParamValue::Number(1.0),
            ParamKind::Colour => ParamValue::Colour(Rgba::WHITE),
        });
        ui.horizontal(|ui| {
            ui.label(theme::muted(name).monospace().size(12.5));
            match kind {
                ParamKind::Number => {
                    let mut amount = match fills.get(name) {
                        Some(ParamValue::Number(number)) => *number,
                        _ => 1.0,
                    };
                    let top = (amount.abs() * 4.0).max(10.0);
                    if design_tokens::widgets::slider(ui, egui::Slider::new(&mut amount, 0.0..=top))
                        .changed()
                    {
                        fills.insert(name.clone(), ParamValue::Number(amount));
                    }
                }
                ParamKind::Colour => {
                    let held = match fills.get(name) {
                        Some(ParamValue::Colour(colour)) => *colour,
                        _ => Rgba::WHITE,
                    };
                    let [r, g, b, a] = held.0.to_be_bytes();
                    let mut colour = Color32::from_rgba_unmultiplied(r, g, b, a);
                    if ui.color_edit_button_srgba(&mut colour).changed() {
                        let [r, g, b, a] = colour.to_srgba_unmultiplied();
                        fills.insert(name.clone(), ParamValue::Colour(Rgba::from([r, g, b, a])));
                    }
                }
            }
        });
    }
    let fills = fills.clone();
    let elapsed = views.scrub * total;
    let size = EVec2::new(PREVIEW[0] as f32, PREVIEW[1] as f32);
    let (rect, _) = ui.allocate_exact_size(size, egui::Sense::hover());
    if let Some(stage) = &views.stage {
        ui.painter().image(
            stage.texture,
            rect,
            egui::Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
            Color32::WHITE,
        );
    } else {
        ui.painter().rect_filled(rect, 4.0, theme::CANVAS);
    }
    let to_image =
        |at: Vec2| rect.min + EVec2::new(at.x * ZOOM + size.x / 2.0, -at.y * ZOOM + size.y / 2.0);
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
        let [r, g, b, _] = overlay.colour.0.to_be_bytes();
        let ink = Color32::from_rgba_unmultiplied(r, g, b, (overlay.alpha * 255.0) as u8);
        ui.painter().text(
            at,
            egui::Align2::CENTER_BOTTOM,
            &overlay.text,
            FontId::proportional(overlay.size * ZOOM),
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

fn seed_defaults(editor: &mut Editor, key: &str, defaults: &[(String, ParamKind, ParamValue)]) {
    let fills = editor.views.vfx.fills.entry(key.to_owned()).or_default();
    for (name, _, default) in defaults {
        fills.entry(name.clone()).or_insert(*default);
    }
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

fn code_pane(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    def: &VfxShaderDef,
    source: &str,
) -> String {
    let file = format!("assets/{source}");
    let current = editor
        .project
        .as_ref()
        .and_then(|project| project.files.text(&file))
        .unwrap_or_default();
    let id = ui.id().with(("shader-code", key));
    let mut draft = draft_or(ui, id, current.clone());
    let response = ui.add(
        egui::TextEdit::multiline(&mut draft)
            .code_editor()
            .font(FontId::monospace(12.5))
            .desired_width(f32::INFINITY)
            .desired_rows(CODE_ROWS),
    );
    if response.changed() {
        set_draft(ui, id, &draft);
    }
    let dirty = draft != current;
    let verdict = def.check_source(&draft);
    ui.horizontal(|ui| {
        match &verdict {
            Ok(_) => {
                ui.label(theme::ok("✓ compiles"));
            }
            Err(error) => {
                let place = error
                    .line
                    .map(|(line, column)| format!("line {line}:{column} · "))
                    .unwrap_or_default();
                ui.label(theme::warn(format!("✗ {place}{}", error.message)));
            }
        }
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if dirty {
                let apply = widgets::primary(ui, "Apply").clicked();
                if ui.button("Revert").clicked() {
                    clear_draft(ui, id);
                }
                if apply || (response.lost_focus() && verdict.is_ok()) {
                    let mut edit = ContentEdit::new(format!("Edit shader {source}")).merging();
                    edit.write(file.clone(), Arc::from(draft.as_bytes()));
                    if editor.apply(edit) {
                        clear_draft(ui, id);
                    }
                }
            } else {
                ui.label(theme::faint("saved as typed once it compiles").size(12.0));
            }
        });
    });
    draft
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
        colour: Rgba,
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
    colour: Rgba,
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
    shaders: HashMap<String, Handle<Shader>>,
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
                    clear_color: ClearColorConfig::Custom(Color::srgb(0.08, 0.08, 0.1)),
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
            &[255, 255, 255, 255],
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

fn site_frame(world: &World, target: &Target, actor: Option<Entity>) -> Option<SiteFrame> {
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
                area: vfx_render::AreaShape::default(),
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
        Target::Screen => Some(SiteFrame {
            kind: SITE_SCREEN,
            center: Vec2::ZERO,
            size: Vec2::new(PREVIEW[0] as f32, PREVIEW[1] as f32) / ZOOM,
            facing: 0.0,
            texture: None,
            area: vfx_render::AreaShape::default(),
        }),
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
        .or_else(|| files.text(&format!("assets/{}", def.source.as_str())))
        .unwrap_or_default();
    let composed = match def.check_source(&source) {
        Ok(composed) => composed,
        Err(error) => {
            problems.push(format!("{shader}: {}", error.message));
            return false;
        }
    };
    let handle = stage
        .shaders
        .entry(composed.clone())
        .or_insert_with(|| {
            let path = format!(
                "vfx_preview/{shader}-{}.wgsl",
                crate::project::hash(composed.as_bytes())
            );
            world
                .resource_mut::<Assets<Shader>>()
                .add(Shader::from_wgsl(composed.clone(), path))
        })
        .clone();
    let Some(material) = world
        .get::<MeshMaterial2d<VfxMaterial>>(piece)
        .map(|material| material.0.clone())
    else {
        return false;
    };
    let overscan = if frame.texture.is_some() {
        OVERSCAN
    } else {
        1.0
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
        transform.scale = Vec3::new(frame.size.x * overscan, frame.size.y * overscan, 1.0);
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
