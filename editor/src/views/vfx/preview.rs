//! The vfx preview: a stage off screen that plays a row's layers on a site of the designer's
//! choosing (an actor, an area, a crowd in an area, or the screen) into an image the view shows,
//! drawn through the same site frames and presenters as the game.

use std::collections::{BTreeMap, HashMap};
use std::f32::consts::PI;

use bevy::camera::visibility::RenderLayers;
use bevy::camera::{ClearColorConfig, RenderTarget};
use bevy::prelude::*;
use bevy::shader::Shader;
use bevy_egui::EguiUserTextures;
use egui::{Color32, FontId, Pos2, Stroke, Ui, Vec2 as EVec2};
use engine::core::content::Content;
use engine::core::geometry::{Degrees, Footprint, Shape};
use engine::core::math::{Direction, Pos, Rgba};
use engine::core::render::{TILE, ToScreen};
use engine::core::tiling::Tiles;
use engine::core::time::{PlaybackRate, Seconds};
use engine::core::vfx::render::{self as vfx_render, ParamsUniform, Run, SiteFrame, SiteTexture};
use engine::core::vfx::{
    ParamValue, ShaderError, SiteKind, TextFloat, VfxDef, VfxLayer, VfxParams, VfxShaderDef,
    shader_file,
};
use engine::systems::actor::render::{ACTOR_ANCHOR, draw_actor_frame};
use engine::systems::actor::{Action, ActorModel, ModelDef, ModelId};
use strum::VariantArray;

use super::SHADER_TABLE;
use super::params::{ParamSpec, param_control};
use crate::app::Editor;
use crate::project::{ProjectFiles, hash, row_file};
use crate::ui::{theme, widgets};
use crate::views::area::scene;
use crate::views::model;

pub const PREVIEW: [u32; 2] = [384, 288];
const ZOOM: f32 = 2.0;
const PREVIEW_LAYER: usize = 31;
const REST_BETWEEN_PLAYS: f32 = 0.5;
const SLIDER_SURROUND: f32 = 130.0;
const BACKDROP_SCENE: &str = "vfx-preview";
const MOST_ACTORS: u32 = 100;
const FIRST_CROWD: u32 = 3;
const SPREAD_CANDIDATES: usize = 4096;
const SPREAD_ROUNDS: usize = 12;
const GROUND_DEPTH: f32 = 0.5;
const ACTOR_DEPTH: f32 = 1.0;
const SPRITE_DEPTH: f32 = 2.0;
const OVER_ACTORS_DEPTH: f32 = 3.0;

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

/// The site a preview plays on. Actors stand on the backdrop playing an animation of the game's
/// models; a crowd spreads evenly over the area, cycling through the models in key order.
#[derive(Clone, Debug, PartialEq)]
pub enum Target {
    Actor {
        model: String,
        action: Action,
    },
    Area {
        shape: Shape,
        facing: Degrees,
    },
    Crowd {
        shape: Shape,
        facing: Degrees,
        count: u32,
        action: Action,
    },
    Screen,
}

impl Default for Target {
    fn default() -> Target {
        Target::Actor {
            model: String::new(),
            action: Action::Idle,
        }
    }
}

pub fn preview(
    editor: &mut Editor,
    ui: &mut Ui,
    key: &str,
    layers: Vec<VfxLayer>,
    specs: &[ParamSpec],
    drafts: &[(String, String)],
) {
    let Some(content) = editor.loaded() else {
        ui.label(theme::muted("the preview plays once the content loads"));
        return;
    };
    let models: Vec<String> = content.table::<ModelDef>().keys().to_vec();
    let total = layers
        .iter()
        .map(|layer| layer.ends().0)
        .fold(0.5_f32, f32::max);
    let now = ui.input(|input| input.time);
    let views = &mut editor.views.vfx;
    if let Target::Actor { model, .. } = &mut views.target
        && model.is_empty()
        && let Some(first) = models.first()
    {
        *model = first.clone();
    }
    ui.horizontal_wrapped(|ui| {
        for (label, on) in [
            ("actor", matches!(views.target, Target::Actor { .. })),
            ("area", matches!(views.target, Target::Area { .. })),
            (
                "area + actors",
                matches!(views.target, Target::Crowd { .. }),
            ),
            ("screen", views.target == Target::Screen),
        ] {
            if widgets::mode_chip(ui, label, on).clicked() && !on {
                views.target = match label {
                    "actor" => Target::Actor {
                        model: models.first().cloned().unwrap_or_default(),
                        action: Action::Idle,
                    },
                    "area" => Target::Area {
                        shape: Shape::Circle { radius: Tiles(1.5) },
                        facing: Degrees(0.0),
                    },
                    "area + actors" => Target::Crowd {
                        shape: Shape::Circle { radius: Tiles(2.5) },
                        facing: Degrees(0.0),
                        count: FIRST_CROWD,
                        action: Action::Idle,
                    },
                    _ => Target::Screen,
                };
            }
        }
    });
    ui.horizontal_wrapped(|ui| match &mut views.target {
        Target::Actor { model, action } => {
            widgets::combo_box("preview-model")
                .width(160.0)
                .selected_text(theme::mono(model.as_str()).size(13.0))
                .show_ui(ui, |ui| {
                    for candidate in &models {
                        ui.selectable_value(model, candidate.clone(), candidate);
                    }
                });
            ui.end_row();
            action_combo(ui, action);
        }
        Target::Area { shape, facing } => {
            shape_fields(ui, shape);
            facing_field(ui, facing);
        }
        Target::Crowd {
            shape,
            facing,
            count,
            action,
        } => {
            shape_fields(ui, shape);
            facing_field(ui, facing);
            ui.end_row();
            ui.label(theme::faint("actors").size(12.0));
            ui.spacing_mut().slider_width = (ui.available_width() - SLIDER_SURROUND).max(60.0);
            design_tokens::widgets::slider(ui, egui::Slider::new(count, 1..=MOST_ACTORS));
            ui.end_row();
            action_combo(ui, action);
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
    for spec in specs {
        fills.entry(spec.name.clone()).or_insert(spec.default);
    }
    if !specs.is_empty() && ui.button("reset to defaults").clicked() {
        for spec in specs {
            fills.insert(spec.name.clone(), spec.default);
        }
    }
    ui.spacing_mut().slider_width = (ui.available_width() - SLIDER_SURROUND).max(60.0);
    for spec in specs {
        ui.horizontal(|ui| {
            ui.label(theme::muted(&spec.name).monospace().size(12.5));
            let mut value = fills.get(&spec.name).copied().unwrap_or(spec.default);
            if param_control(ui, spec, &mut value) {
                fills.insert(spec.name.clone(), value);
            }
        });
    }
    let given = VfxParams(fills.iter().map(|(k, v)| (k.clone(), *v)).collect());
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
    if let Some(footprint) = views.target.footprint() {
        let outline: Vec<Pos2> = footprint
            .outline()
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
        ui.painter().text(
            to_image(overlay.at),
            egui::Align2::CENTER_BOTTOM,
            &overlay.text,
            FontId::proportional(overlay.size * zoom),
            Color32::from(overlay.color).gamma_multiply(overlay.alpha),
        );
    }
    for problem in &views.problems {
        ui.label(theme::warn(problem));
    }
    let signature = format!("{key}|{}|{:?}", layers_signature(&layers), views.target);
    views.request = Some(PreviewRequest {
        layers,
        target: views.target.clone(),
        elapsed: Seconds(elapsed),
        now,
        given,
        drafts: drafts.iter().cloned().collect(),
        signature,
    });
}

/// Renders the requested preview into its image, so the next frame's panel shows it.
pub fn sync(editor: &mut Editor, world: &mut World) {
    let Some(request) = editor.views.vfx.request.take() else {
        if let Some(stage) = editor.views.vfx.stage.take() {
            stage.despawn(world);
        }
        return;
    };
    let Editor { views, project, .. } = editor;
    let Some((files, content)) = project
        .as_ref()
        .and_then(|project| Some((&project.files, project.content.as_ref()?)))
    else {
        return;
    };
    let stage = views.vfx.stage.get_or_insert_with(|| Stage::spawn(world));
    if stage.signature != request.signature {
        stage.clear_pieces(world);
        stage.signature = request.signature.clone();
        stage.pieces = request
            .layers
            .iter()
            .map(|layer| spawn_piece(world, layer, &mut views.area.scenes, files))
            .collect();
        stage.actors = spawn_actors(
            world,
            content,
            &request.target,
            &mut views.area.scenes,
            files,
        );
    }
    for actor in &stage.actors {
        actor.animate(world, content, request.now);
    }
    let behind = views
        .area
        .scenes
        .by_key
        .get(BACKDROP_SCENE)
        .filter(|_| views.vfx.background)
        .map(|scene| SiteTexture {
            image: scene.image.clone(),
            rect: {
                let uv = scene.uv();
                Rect::from_corners(Vec2::new(uv.min.x, uv.min.y), Vec2::new(uv.max.x, uv.max.y))
            },
            pixel: Vec2::ONE / Vec2::new(scene.alloc[0] as f32, scene.alloc[1] as f32),
        });
    let Some(frame) = site_frame(world, &request.target, stage.actors.first(), behind) else {
        return;
    };
    views.vfx.overlays.clear();
    views.vfx.problems.clear();
    let mut overdrawn = false;
    let pieces = stage.pieces.clone();
    for (index, (layer, piece)) in request.layers.iter().zip(&pieces).enumerate() {
        let time = layer.at(request.elapsed);
        match (layer, piece) {
            (
                VfxLayer::Text {
                    template,
                    color,
                    size,
                    rise,
                    ..
                },
                _,
            ) => {
                if let Some(time) = time {
                    let float = TextFloat::at(time.progress);
                    let risen = frame.head().y + rise.0 * TILE.0 * float.risen;
                    views.vfx.overlays.push(Overlay {
                        text: VfxDef::fill(template, &request.given),
                        color: *color,
                        size: *size,
                        at: Vec2::new(frame.center.x, risen),
                        alpha: float.alpha,
                    });
                }
            }
            (_, None) => {}
            (_, Some(piece)) => {
                let Some(time) = time else {
                    vfx_render::hide(world, *piece);
                    continue;
                };
                match layer {
                    VfxLayer::Sprite { .. } => {
                        if vfx_render::present_sprite(world, *piece, &frame, layer, time.local) {
                            set_depth(world, *piece, SPRITE_DEPTH + index as f32 * 0.01);
                        }
                    }
                    VfxLayer::Shader { shader, params, .. } => {
                        let key = shader.key(content);
                        let compiled = stage.compile(world, key, files, &request.drafts);
                        let (def, handle) = match compiled {
                            Ok(compiled) => compiled,
                            Err(problem) => {
                                views.vfx.problems.push(problem);
                                vfx_render::hide(world, *piece);
                                continue;
                            }
                        };
                        let packed = ParamsUniform::pack(&def, |name| {
                            params.get(name)?.resolve(&request.given)
                        });
                        let run = Run {
                            progress: time.progress,
                            time: request.elapsed,
                        };
                        vfx_render::present_shader(world, *piece, &frame, handle, packed, run);
                        let depth = if frame.kind == SiteKind::Area {
                            GROUND_DEPTH
                        } else {
                            OVER_ACTORS_DEPTH
                        };
                        set_depth(world, *piece, depth);
                        overdrawn |= frame.kind == SiteKind::Actor;
                    }
                    VfxLayer::Text { .. } => {}
                }
            }
        }
    }
    if let Some(actor) = stage.actors.first() {
        set_alpha(world, actor.entity, if overdrawn { 0.0 } else { 1.0 });
    }
}

impl Target {
    fn footprint(&self) -> Option<Footprint> {
        match self {
            Target::Area { shape, facing } | Target::Crowd { shape, facing, .. } => {
                Some(Footprint {
                    at: Pos::new(0.0, 0.0),
                    facing: facing.radians(),
                    shape: *shape,
                })
            }
            Target::Actor { .. } | Target::Screen => None,
        }
    }
}

fn action_combo(ui: &mut Ui, action: &mut Action) {
    widgets::combo_box("preview-action")
        .width(90.0)
        .selected_text(theme::mono(action.as_ref()).size(13.0))
        .show_ui(ui, |ui| {
            for candidate in Action::VARIANTS {
                ui.selectable_value(action, *candidate, candidate.as_ref());
            }
        });
}

fn facing_field(ui: &mut Ui, facing: &mut Degrees) {
    ui.add(
        egui::DragValue::new(&mut facing.0)
            .range(0.0..=360.0)
            .suffix("°"),
    );
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

struct PreviewRequest {
    layers: Vec<VfxLayer>,
    target: Target,
    elapsed: Seconds,
    now: f64,
    given: VfxParams,
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
    actors: Vec<StagedActor>,
    pieces: Vec<Option<Entity>>,
    /// The last shader compiled for each shader key, by the hash of the text it was composed from.
    shaders: HashMap<String, (String, Result<Handle<Shader>, ShaderError>)>,
    signature: String,
}

/// An actor on the stage: its sprite entity, the model and action it plays, with its feet at
/// `feet`.
struct StagedActor {
    entity: Entity,
    model: ModelId,
    action: Action,
    feet: Vec2,
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
        Stage {
            camera,
            image,
            texture,
            actors: Vec::new(),
            pieces: Vec::new(),
            shaders: HashMap::new(),
            signature: String::new(),
        }
    }

    /// The shader row as it stands in the files, compiled from its draft or its file, kept until
    /// either changes.
    fn compile(
        &mut self,
        world: &mut World,
        key: &str,
        files: &ProjectFiles,
        drafts: &HashMap<String, String>,
    ) -> Result<(VfxShaderDef, Handle<Shader>), String> {
        let row = files
            .json(&row_file(SHADER_TABLE, key))
            .ok_or_else(|| format!("no shader row {key}"))?;
        let def: VfxShaderDef = serde_json::from_value((*row).clone())
            .map_err(|_| format!("{SHADER_TABLE}/{key} does not parse"))?;
        let source = drafts
            .get(key)
            .cloned()
            .or_else(|| files.text(&shader_file(key)))
            .unwrap_or_default();
        let composed = def.compose(&source);
        let fingerprint = hash(composed.as_bytes());
        let fresh = self
            .shaders
            .get(key)
            .is_none_or(|(known, _)| *known != fingerprint);
        if fresh {
            let verdict = def.check_source(&source).map(|composed| {
                let path = format!("vfx_preview/{key}-{fingerprint}.wgsl");
                world
                    .resource_mut::<Assets<Shader>>()
                    .add(Shader::from_wgsl(composed, path))
            });
            self.shaders.insert(key.to_owned(), (fingerprint, verdict));
        }
        match &self.shaders[key].1 {
            Ok(handle) => Ok((def, handle.clone())),
            Err(error) => Err(format!("{key}: {}", error.message)),
        }
    }

    fn clear_pieces(&mut self, world: &mut World) {
        for piece in self.pieces.drain(..).flatten() {
            world.despawn(piece);
        }
        for actor in self.actors.drain(..) {
            world.despawn(actor.entity);
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

impl StagedActor {
    fn animate(&self, world: &mut World, content: &Content, now: f64) {
        let model = ActorModel::get(content, self.model);
        let mut entity = world.entity_mut(self.entity);
        if let Some(mut sprite) = entity.get_mut::<Sprite>() {
            draw_actor_frame(
                &mut sprite,
                model,
                self.action,
                Direction::S,
                Seconds(now as f32),
                PlaybackRate(1.0),
            );
        }
        if let Some(mut transform) = entity.get_mut::<Transform>() {
            transform.translation =
                Vec3::new(self.feet.x, self.feet.y, ACTOR_DEPTH - self.feet.y * 0.001);
        }
    }
}

fn spawn_piece(
    world: &mut World,
    layer: &VfxLayer,
    scenes: &mut scene::AreaScenes,
    files: &ProjectFiles,
) -> Option<Entity> {
    let piece = match layer {
        VfxLayer::Sprite { sheet, .. } => {
            let image = scene::image_handle(scenes, files, sheet.as_str(), world);
            vfx_render::sprite_piece(world, image)
        }
        VfxLayer::Shader { .. } => vfx_render::shader_piece(world),
        VfxLayer::Text { .. } => return None,
    };
    world
        .entity_mut(piece)
        .insert(RenderLayers::layer(PREVIEW_LAYER));
    Some(piece)
}

fn spawn_actors(
    world: &mut World,
    content: &Content,
    target: &Target,
    scenes: &mut scene::AreaScenes,
    files: &ProjectFiles,
) -> Vec<StagedActor> {
    let (placements, action): (Vec<(ModelId, Vec2)>, Action) = match target {
        Target::Actor { model, action } => match content.by_key::<ModelDef>(model) {
            Some(model) => (vec![(model, Vec2::ZERO)], *action),
            None => return Vec::new(),
        },
        Target::Crowd { count, action, .. } => {
            let models: Vec<ModelId> = content.table::<ModelDef>().ids().collect();
            let Some(footprint) = target.footprint() else {
                return Vec::new();
            };
            if models.is_empty() {
                return Vec::new();
            }
            let placed = spread(&footprint, *count)
                .into_iter()
                .enumerate()
                .map(|(index, at)| (models[index % models.len()], at.to_screen()))
                .collect();
            (placed, *action)
        }
        Target::Area { .. } | Target::Screen => return Vec::new(),
    };
    placements
        .into_iter()
        .map(|(model, feet)| {
            let sheet = ActorModel::get(content, model).sheet().as_str();
            let image = scene::image_handle(scenes, files, sheet, world);
            let entity = world
                .spawn((
                    Sprite { image, ..default() },
                    ACTOR_ANCHOR,
                    Transform::default(),
                    RenderLayers::layer(PREVIEW_LAYER),
                ))
                .id();
            StagedActor {
                entity,
                model,
                action,
                feet,
            }
        })
        .collect()
}

/// `count` points spread evenly over the footprint, the same every time: a sunflower spiral over
/// the footprint's reach, kept where it falls inside, gives the candidates; picks start at even
/// strides through them and relax to the middle of the candidates nearest each, so they end up
/// evenly apart and well inside whatever the shape is.
fn spread(footprint: &Footprint, count: u32) -> Vec<Pos<Tiles>> {
    let reach = footprint.reach().0.max(0.1);
    let golden = PI * (3.0 - 5f32.sqrt());
    let inside: Vec<Pos<Tiles>> = (0..SPREAD_CANDIDATES)
        .map(|index| {
            let radius = reach * ((index as f32 + 0.5) / SPREAD_CANDIDATES as f32).sqrt();
            let angle = index as f32 * golden;
            Pos::new(
                footprint.at.x + radius * angle.cos(),
                footprint.at.y + radius * angle.sin(),
            )
        })
        .filter(|point| footprint.contains(*point))
        .collect();
    if inside.is_empty() {
        return vec![footprint.at; count as usize];
    }
    let mut picks: Vec<usize> = (0..count)
        .map(|k| {
            let stride = (k as f32 + 0.5) * inside.len() as f32 / count as f32;
            (stride as usize).min(inside.len() - 1)
        })
        .collect();
    let nearest = |to: Pos<Tiles>, among: &[usize]| {
        among
            .iter()
            .copied()
            .min_by(|a, b| {
                (inside[*a] - to)
                    .length()
                    .total_cmp(&(inside[*b] - to).length())
            })
            .unwrap_or(0)
    };
    let all: Vec<usize> = (0..inside.len()).collect();
    for _ in 0..SPREAD_ROUNDS {
        let mut sums = vec![(Vec2::ZERO, 0usize); picks.len()];
        for point in &inside {
            let owner = picks
                .iter()
                .enumerate()
                .min_by(|a, b| {
                    (inside[*a.1] - *point)
                        .length()
                        .total_cmp(&(inside[*b.1] - *point).length())
                })
                .map_or(0, |(owner, _)| owner);
            sums[owner].0 += Vec2::new(point.x, point.y);
            sums[owner].1 += 1;
        }
        for (pick, (sum, members)) in picks.iter_mut().zip(sums) {
            if members > 0 {
                let mean = sum / members as f32;
                *pick = nearest(Pos::new(mean.x, mean.y), &all);
            }
        }
    }
    picks.into_iter().map(|pick| inside[pick]).collect()
}

// The screen site's image is the area drawn behind the preview, so a screen-wide shader has
// something to work on, as it has the frame in the game.
fn site_frame(
    world: &World,
    target: &Target,
    actor: Option<&StagedActor>,
    behind: Option<SiteTexture>,
) -> Option<SiteFrame> {
    match target {
        Target::Actor { .. } => SiteFrame::sprite(world, actor?.entity, SiteKind::Actor),
        Target::Area { .. } | Target::Crowd { .. } => Some(SiteFrame::area(&target.footprint()?)),
        Target::Screen => {
            let size = Vec2::new(PREVIEW[0] as f32, PREVIEW[1] as f32) / ZOOM;
            Some(SiteFrame::screen(size, behind, 1.0))
        }
    }
}

fn set_depth(world: &mut World, entity: Entity, z: f32) {
    if let Some(mut transform) = world.get_mut::<Transform>(entity) {
        transform.translation.z = z;
    }
}

fn set_alpha(world: &mut World, entity: Entity, alpha: f32) {
    if let Some(mut sprite) = world.get_mut::<Sprite>(entity)
        && sprite.color.alpha() != alpha
    {
        sprite.color.set_alpha(alpha);
    }
}

fn layers_signature(layers: &[VfxLayer]) -> String {
    layers
        .iter()
        .map(|layer| match layer {
            VfxLayer::Sprite { sheet, .. } => format!("sprite:{}", sheet.as_str()),
            VfxLayer::Text { .. } => "text".to_owned(),
            VfxLayer::Shader { shader, .. } => format!("shader:{}", shader.index()),
        })
        .collect::<Vec<_>>()
        .join(",")
}
