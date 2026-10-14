use std::collections::HashMap;

use bevy::diagnostic::FrameCount;
use bevy::input::ButtonState;
use bevy::input::keyboard::KeyboardInput;
use bevy::input::mouse::{MouseButtonInput, MouseWheel};
use bevy::input_focus::InputFocus;
use bevy::picking::PickingSystems;
use bevy::picking::events::PointerClick;
use bevy::prelude::*;
use bevy::text::EditableText;
use bevy::ui::ComputedNode;
use bevy::window::PrimaryWindow;
use serde::{Deserialize, Serialize};

use crate::core::audio::mix::AudioCategory;
use crate::core::audio::playback::Listener;
use crate::core::audio::soundscape::{self, SoundscapeMixer, SoundscapeShape};
use crate::core::content::{Content, ContentScope, with_content};
use crate::core::math::{Offset, Pos, Rect, Size, WindowPx};
use crate::core::render::tile_to_window;
use crate::core::render::transition::ScreenTransitionPhase;
use crate::core::tiling::{TilePos, Tiles};
use crate::core::time::Seconds;
use crate::systems::actor::model::ModelId;
use crate::systems::actor::{self, Action, Actor, ActorModel, Hitbox};
use crate::systems::area::{self, AreaId, AreaObject, AreaTag};
use crate::systems::attention::{Attention, AttentionId, StatusBadges};
use crate::systems::combat::{self, Attitude};
use crate::systems::dialogue::stage;
use crate::systems::history::widget::{self as history, HistoryBook};
use crate::systems::history::{HistoryMark, HistoryRecord, HistoryTopic};
use crate::systems::input::gestures::{self, ClickClaim};
use crate::systems::input::map::InputMap;
use crate::systems::interact;
use crate::systems::item::card::ItemCardWindow;
use crate::systems::item::{self, DroppedItem, Inventory, ItemId};
use crate::systems::movement::Position;
use crate::systems::notification::{NotificationRows, bubble, error, feed, intro, shown_rows};
use crate::systems::npc::{Npc, NpcId};
use crate::systems::player::{Owner, commands_locked, session};
use crate::systems::quest::{Parties, QuestId, QuestLog, QuestResult};
use crate::systems::script::{OwnerKind, OwnerRow, Reach, RiftScripts};
use crate::systems::shop;
use crate::systems::shop::ShopId;
use crate::systems::stat::{StatKind, Stats};

/// How a driver asks the client what it shows: the frame after a driver asks answers it.
pub trait ProbeChannel {
    fn awaited(&self) -> bool;
    fn deliver(&self, snapshot: &str);
}

pub fn install(app: &mut App, channel: impl ProbeChannel + 'static) {
    app.insert_non_send(Probe(Box::new(channel)))
        .init_resource::<ProbeInputSeen>()
        .add_systems(PreUpdate, count_input.after(PickingSystems::Last))
        .add_systems(Last, publish);
}

/// One frame of the client. Content ids (de)serialize by key, so a driver reads a snapshot within a
/// content scope. World positions are tiles, which `view` places in the window; window positions
/// are the window's logical pixels. `viewpoint` is the character the camera follows: `me`, or the
/// player a spectator watches.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeSnapshot {
    pub frame: u32,
    pub input: ProbeInput,
    pub claim: ClickClaim,
    pub screen: Option<Size<WindowPx>>,
    pub view: Option<ProbeView>,
    pub area: Option<AreaId>,
    pub me: Option<ProbeBody>,
    pub viewpoint: Option<ProbeBody>,
    pub actors: Vec<ProbeBody>,
    pub props: Vec<ProbeFixture>,
    pub items: Vec<ProbeGroundItem>,
    pub portals: Vec<ProbeExit>,
    /// What the interface shows: text, icons, fields and sliders, less what is scrolled or clipped
    /// out of sight.
    pub ui: Vec<ProbeUiElement>,
    pub covered: Vec<Rect<WindowPx>>,
    pub stage: Option<ProbeStage>,
    pub notifications: ProbeNotifications,
    pub feed: Vec<String>,
    pub history: ProbeHistory,
    pub shop: Option<ProbeShop>,
    pub item_card: Option<ProbeItemCard>,
    pub bag: Vec<ProbeStack>,
    pub quests: ProbeQuests,
    pub soundscape: ProbeSoundscape,
    pub transition: ScreenTransitionPhase,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct ProbeInput {
    pub cursor: Option<Pos<WindowPx>>,
    #[serde(flatten)]
    pub seen: ProbeInputSeen,
}

/// What the driver has sent so far, as the game received it: a driver that counts what it sends
/// knows when the game has caught up, however slowly frames come.
#[derive(Resource, Serialize, Deserialize, Default, Clone, Copy, PartialEq, Eq, Debug)]
pub struct ProbeInputSeen {
    pub mouse_presses: u32,
    pub mouse_releases: u32,
    /// How many clicks in a row the game counted the latest one as.
    pub click_run: u8,
    pub wheel_turns: u32,
    pub key_presses: u32,
}

/// Where tile (0, 0) shows in the window, and how far one tile over and down takes it.
#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct ProbeView {
    pub origin: Pos<WindowPx>,
    pub tile: Offset<WindowPx>,
}

impl ProbeView {
    pub fn window_point(&self, at: Pos<Tiles>) -> Pos<WindowPx> {
        self.origin + Offset::new(at.x * self.tile.x, at.y * self.tile.y)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeBody {
    pub id: Entity,
    pub name: String,
    pub model: ModelId,
    pub flies: bool,
    pub player: bool,
    pub at: Pos<Tiles>,
    /// Where a click takes it rather than whatever stands in front of it.
    pub aim: Pos<Tiles>,
    pub hitbox: Rect<Tiles>,
    pub action: Action,
    pub health: f32,
    pub max_health: f32,
    pub npc: Option<NpcId>,
    pub role: Option<String>,
    pub friendly: bool,
    pub locked: bool,
    pub marks: Vec<AttentionId>,
    pub badges: Vec<AttentionId>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeFixture {
    pub id: Entity,
    pub name: Option<String>,
    pub label: Option<String>,
    pub at: Pos<Tiles>,
    pub aim: Pos<Tiles>,
    pub hitbox: Rect<Tiles>,
    pub marks: Vec<AttentionId>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeGroundItem {
    pub id: Entity,
    pub item: ItemId,
    pub count: u32,
    pub at: Pos<Tiles>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeExit {
    pub name: String,
    pub to: AreaId,
    pub at: Pos<Tiles>,
    pub rect: Rect<Tiles>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct ProbeUiElement {
    pub text: Option<String>,
    pub image: Option<String>,
    pub editable: bool,
    pub focused: bool,
    pub click_through: bool,
    pub slider: Option<f32>,
    pub rect: Rect<WindowPx>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeStage {
    pub node: String,
    pub with: Option<Entity>,
    pub line: usize,
    pub lines: usize,
    pub speaker: Option<String>,
    pub text: Option<String>,
    pub typing: bool,
    pub choices: Vec<ProbeChoice>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeChoice {
    pub label: String,
    pub locked: bool,
    pub rect: Option<Rect<WindowPx>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeNotifications {
    pub bubbles: Vec<ProbeBubble>,
    pub edge_folds: Vec<u32>,
    pub captions: NotificationRows,
    pub alerts: NotificationRows,
    pub error: Option<String>,
    pub milestones: NotificationRows,
    pub intro: Option<ProbeIntro>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeBubble {
    pub speaker: String,
    pub npc: NpcId,
    pub body: Option<Entity>,
    pub replaced: u32,
    pub lines: Vec<String>,
    pub folded: bool,
    pub rect: Option<Rect<WindowPx>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeIntro {
    pub title: String,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeHistory {
    pub open: bool,
    pub tab: Option<String>,
    pub records: Vec<ProbeRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeRecord {
    pub topic: HistoryTopic,
    pub by: Option<String>,
    pub text: String,
    pub mark: Option<HistoryMark>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeShop {
    pub shop: ShopId,
    pub offers: Vec<ProbeOffer>,
    pub buyback: Vec<ProbeStack>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeOffer {
    pub item: ItemId,
    pub count: u32,
    pub left: Option<u32>,
    pub refusal: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct ProbeStack {
    pub item: ItemId,
    pub count: u32,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct ProbeItemCard {
    pub item: ItemId,
    pub rect: Rect<WindowPx>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ProbeQuests {
    pub active: Vec<ProbeQuest>,
    pub finished: Vec<ProbeFinishedQuest>,
    pub tracked: Vec<QuestId>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeQuest {
    pub quest: QuestId,
    pub ready: bool,
    pub left: Option<Seconds>,
    /// Each objective's [have, need].
    pub progress: Vec<[u32; 2]>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct ProbeFinishedQuest {
    pub quest: QuestId,
    pub result: QuestResult,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeSoundscape {
    pub zones: Vec<ProbeSoundZone>,
    pub voices: Vec<ProbeVoice>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeSoundZone {
    pub bounds: Rect<Tiles>,
    pub ellipse: bool,
    pub reach: Tiles,
    pub proximity: f32,
    pub tracks: Vec<ProbeTrack>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeTrack {
    pub channel: u32,
    pub src: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProbeVoice {
    pub channel: u32,
    pub category: AudioCategory,
    pub src: String,
    pub heard: f32,
}

struct Probe(Box<dyn ProbeChannel>);

fn count_input(
    mut seen: ResMut<ProbeInputSeen>,
    mut buttons: MessageReader<MouseButtonInput>,
    mut clicks: MessageReader<PointerClick>,
    mut wheels: MessageReader<MouseWheel>,
    mut keys: MessageReader<KeyboardInput>,
) {
    for button in buttons.read() {
        match button.state {
            ButtonState::Pressed => seen.mouse_presses += 1,
            ButtonState::Released => seen.mouse_releases += 1,
        }
    }
    if let Some(run) = clicks.read().map(|click| click.count).max() {
        seen.click_run = run;
    }
    seen.wheel_turns += wheels.read().count() as u32;
    for key in keys.read() {
        if key.state == ButtonState::Pressed && !key.repeat {
            seen.key_presses += 1;
        }
    }
}

// A snapshot scans the whole world, so only a frame the driver is waiting for pays for one.
fn publish(world: &mut World) {
    if !world.contains_resource::<Content>() || !world.non_send::<Probe>().0.awaited() {
        return;
    }
    let snapshot = snapshot(world);
    let scope = ContentScope::of(world.resource::<Content>());
    let (json, _) = with_content(scope, || {
        serde_json::to_string(&snapshot).expect("a serializable snapshot")
    });
    world.non_send::<Probe>().0.deliver(&json);
}

fn snapshot(world: &mut World) -> ProbeSnapshot {
    let content = *world.resource::<Content>();
    let me = session::my_character(world).map(|me| me.id());
    let viewpoint = world.resource::<session::Viewpoint>().0;
    let area = viewpoint
        .and_then(|seen| world.get::<AreaTag>(seen))
        .map(|tag| tag.area);
    let view = view(world);
    let rows = choice_rows(world);
    let input_map = world.resource::<InputMap>().clone();
    let history_tab = history::shown_tab(world);
    let window = world
        .query_filtered::<&Window, With<PrimaryWindow>>()
        .single(world)
        .ok()
        .cloned();
    ProbeSnapshot {
        frame: world.resource::<FrameCount>().0,
        input: ProbeInput {
            cursor: window
                .as_ref()
                .and_then(Window::cursor_position)
                .map(|at| Pos::new(at.x, at.y)),
            seen: *world.resource::<ProbeInputSeen>(),
        },
        screen: window
            .as_ref()
            .map(|window| Size::new(window.resolution.width(), window.resolution.height())),
        claim: gestures::claim(world),
        stage: stage::view(world).map(|view| ProbeStage {
            node: view.node,
            with: view.with,
            line: view.line,
            lines: view.lines,
            speaker: view.speaker,
            text: view.text,
            typing: view.typing,
            choices: view
                .choices
                .into_iter()
                .enumerate()
                .map(|(index, choice)| ProbeChoice {
                    label: choice.label,
                    locked: choice.locked,
                    rect: rows.get(&index).copied(),
                })
                .collect(),
        }),
        notifications: notifications(world),
        feed: feed::rows(world),
        history: ProbeHistory {
            open: history_tab.is_some(),
            tab: history_tab.map(|tab| tab.title().to_owned()),
            records: world
                .resource::<HistoryBook>()
                .records()
                .iter()
                .map(|record| record_line(record, &input_map))
                .collect(),
        },
        item_card: world
            .query::<(Entity, &ItemCardWindow)>()
            .iter(world)
            .next()
            .map(|(entity, card)| (entity, card.item))
            .and_then(|(entity, item)| {
                Some(ProbeItemCard {
                    item,
                    rect: ui::node_rect(world, entity).map(window_rect)?,
                })
            }),
        shop: shop::counter::view(world).map(|shown| ProbeShop {
            shop: shown.shop,
            offers: shown
                .shop
                .get(&content)
                .sells()
                .zip(&shown.offers)
                .map(|(offer, view)| ProbeOffer {
                    item: offer.item,
                    count: offer.count,
                    left: view.left,
                    refusal: view
                        .refusal
                        .as_ref()
                        .map(|refusal| refusal.describe(&content)),
                })
                .collect(),
            buyback: shown
                .buyback
                .iter()
                .map(|sale| ProbeStack {
                    item: sale.item,
                    count: sale.count,
                })
                .collect(),
        }),
        bag: viewpoint
            .and_then(|seen| world.get::<Inventory>(seen))
            .map(|inventory| {
                inventory
                    .slots
                    .iter()
                    .map(|stack| ProbeStack {
                        item: stack.item,
                        count: stack.count,
                    })
                    .collect()
            })
            .unwrap_or_default(),
        quests: viewpoint
            .and_then(|seen| quests(world, seen))
            .unwrap_or_default(),
        me: me.and_then(|me| body(world, me)),
        viewpoint: viewpoint.and_then(|seen| body(world, seen)),
        actors: actors(world, me, area),
        props: props(world, area),
        items: items(world, area),
        portals: portals(world, area),
        ui: ui(world),
        covered: covered(world),
        soundscape: soundscape(world),
        transition: *world.resource::<ScreenTransitionPhase>(),
        view,
        area,
    }
}

fn record_line(record: &HistoryRecord, inputs: &InputMap) -> ProbeRecord {
    let text = record.entry.text.words(inputs);
    ProbeRecord {
        topic: record.entry.topic,
        by: record.entry.by.clone(),
        text: record
            .entry
            .tally
            .map_or_else(|| text.clone(), |tally| tally.line(&text)),
        mark: record.entry.mark,
    }
}

fn soundscape(world: &World) -> ProbeSoundscape {
    let listener = world.resource::<Listener>().0;
    ProbeSoundscape {
        zones: world
            .resource::<soundscape::Soundscape>()
            .0
            .iter()
            .map(|zone| ProbeSoundZone {
                bounds: zone.shape.bounds(),
                ellipse: matches!(zone.shape, SoundscapeShape::Ellipse(_)),
                reach: zone.reach(),
                proximity: listener
                    .and_then(|at| zone.heard_from(at))
                    .map_or(0.0, |heard| heard.proximity),
                tracks: zone
                    .channels
                    .iter()
                    .map(|(channel, layer)| ProbeTrack {
                        channel: channel.0,
                        src: layer.src.as_str().to_owned(),
                    })
                    .collect(),
            })
            .collect(),
        voices: world
            .resource::<SoundscapeMixer>()
            .voices()
            .iter()
            .map(|voice| ProbeVoice {
                channel: voice.channel.0,
                category: voice.channel.category(),
                src: voice.src.to_owned(),
                heard: voice.heard(),
            })
            .collect(),
    }
}

fn quests(world: &World, seen: Entity) -> Option<ProbeQuests> {
    let content = world.resource::<Content>();
    let log = world.get::<QuestLog>(seen)?;
    let inventory = world.get::<Inventory>(seen);
    Some(ProbeQuests {
        active: log
            .active
            .iter()
            .map(|active| ProbeQuest {
                quest: active.quest,
                ready: active.ready,
                left: active.left,
                progress: active
                    .quest
                    .get(content)
                    .progress(content, world.resource::<Parties>(), active, inventory)
                    .iter()
                    .map(|progress| [progress.have, progress.need])
                    .collect(),
            })
            .collect(),
        finished: log
            .finished
            .iter()
            .map(|finished| ProbeFinishedQuest {
                quest: finished.quest,
                result: finished.result,
            })
            .collect(),
        tracked: log.tracked.clone(),
    })
}

fn view(world: &mut World) -> Option<ProbeView> {
    let origin = tile_to_window(world, Pos::new(0.0, 0.0))?;
    let unit = tile_to_window(world, Pos::new(1.0, 1.0))?;
    Some(ProbeView {
        origin: Pos::new(origin.x, origin.y),
        tile: Offset::new(unit.x - origin.x, unit.y - origin.y),
    })
}

fn body(world: &World, entity: Entity) -> Option<ProbeBody> {
    let viewer = world.resource::<session::Viewpoint>().0;
    let marks = viewer
        .and_then(|viewer| world.get::<Attention>(viewer))
        .map(|attention| attention.of(entity).to_vec())
        .unwrap_or_default();
    let locked = commands_locked(world, entity);
    let entity = world.get_entity(entity).ok()?;
    let npc = entity.get::<Npc>().map(|npc| npc.def);
    let at = entity.get::<Position>()?.pos;
    let hitbox = at.hitbox(entity.get::<Hitbox>()?.size);
    let actor = entity.get::<Actor>()?;
    let model = actor.model;
    let flies = ActorModel::get(world.resource::<Content>(), model).airborne();
    let stat = |kind| entity.get::<Stats>().map_or(0.0, |stats| stats.get(kind));
    Some(ProbeBody {
        id: entity.id(),
        name: entity
            .get::<actor::Name>()
            .map_or_else(String::new, |name| name.name.clone()),
        model,
        flies,
        player: entity.contains::<Owner>(),
        at,
        aim: hitbox.center(),
        hitbox,
        action: actor.action,
        health: stat(StatKind::Health),
        max_health: stat(StatKind::MaxHealth),
        npc,
        role: npc
            .and_then(|npc| npc.get(world.resource::<Content>()).nameplate())
            .map(str::to_owned),
        friendly: entity.get::<Attitude>() == Some(&Attitude::Friendly),
        locked,
        marks,
        badges: entity
            .get::<StatusBadges>()
            .map(|badges| badges.0.clone())
            .unwrap_or_default(),
    })
}

fn actors(world: &mut World, me: Option<Entity>, area: Option<AreaId>) -> Vec<ProbeBody> {
    let others: Vec<Entity> = world
        .query_filtered::<(Entity, &AreaTag), With<Actor>>()
        .iter(world)
        .filter(|(entity, tag)| Some(*entity) != me && area.is_none_or(|area| tag.area == area))
        .map(|(entity, _)| entity)
        .collect();
    let bodies: Vec<(Entity, ProbeBody)> = others
        .into_iter()
        .filter_map(|entity| body(world, entity).map(|body| (entity, body)))
        .collect();
    bodies
        .into_iter()
        .map(|(entity, body)| ProbeBody {
            aim: aim(world, entity, body.hitbox),
            ..body
        })
        .collect()
}

fn props(world: &mut World, area: Option<AreaId>) -> Vec<ProbeFixture> {
    let viewer = world.resource::<session::Viewpoint>().0;
    let attention = viewer
        .and_then(|viewer| world.get::<Attention>(viewer))
        .cloned();
    let fixtures: Vec<(Entity, ProbeFixture)> = world
        .query::<(Entity, &AreaObject, &Position, &Hitbox, &AreaTag)>()
        .iter(world)
        .filter(|(.., tag)| area.is_none_or(|area| tag.area == area))
        .filter(|(_, object, ..)| object.look.is_some())
        .map(|(entity, object, at, hitbox, _)| {
            let hitbox = at.pos.hitbox(hitbox.size);
            let fixture = ProbeFixture {
                id: entity,
                name: object.name.clone(),
                label: object.label.clone(),
                at: at.pos,
                aim: hitbox.center(),
                hitbox,
                marks: attention
                    .as_ref()
                    .map(|attention| attention.of(entity).to_vec())
                    .unwrap_or_default(),
            };
            (entity, fixture)
        })
        .collect();
    fixtures
        .into_iter()
        .map(|(entity, fixture)| ProbeFixture {
            aim: aim(world, entity, fixture.hitbox),
            ..fixture
        })
        .collect()
}

fn aim(world: &mut World, entity: Entity, hitbox: Rect<Tiles>) -> Pos<Tiles> {
    const STEPS: u8 = 5;
    let center = hitbox.center();
    let mut spots: Vec<Pos<Tiles>> = (0..STEPS)
        .flat_map(|x| (0..STEPS).map(move |y| (x, y)))
        .map(|(x, y)| {
            hitbox.origin
                + Offset::new(
                    hitbox.size.width * (f32::from(x) + 0.5) / f32::from(STEPS),
                    hitbox.size.height * (f32::from(y) + 0.5) / f32::from(STEPS),
                )
        })
        .collect();
    spots.sort_by(|a, b| a.distance_to(center).total_cmp(&b.distance_to(center)));
    std::iter::once(center)
        .chain(spots)
        .find(|&spot| clicked(world, spot) == Some(entity))
        .unwrap_or(center)
}

fn clicked(world: &mut World, spot: Pos<Tiles>) -> Option<Entity> {
    if let Some(enemy) = combat::enemy_at(world, spot) {
        return Some(enemy);
    }
    if item::pickable_at(world, spot).is_some() {
        return None;
    }
    interact::interactable_at(world, spot)
}

fn items(world: &mut World, area: Option<AreaId>) -> Vec<ProbeGroundItem> {
    world
        .query::<(Entity, &DroppedItem, &Position, &AreaTag)>()
        .iter(world)
        .filter(|(.., tag)| area.is_none_or(|area| tag.area == area))
        .map(|(entity, dropped, at, _)| ProbeGroundItem {
            id: entity,
            item: dropped.item,
            count: dropped.count,
            at: at.pos,
        })
        .collect()
}

fn portals(world: &World, area: Option<AreaId>) -> Vec<ProbeExit> {
    let Some(area) = area else {
        return Vec::new();
    };
    let content = world.resource::<Content>();
    let scripts = world.resource::<RiftScripts>();
    let mut exits: Vec<ProbeExit> = area::objects(area::placed(content, area))
        .filter_map(|(index, object)| {
            let owner = OwnerRow {
                kind: OwnerKind::Object,
                row: area.raw(),
                object: Some(index),
            };
            let warp = scripts
                .may_do(owner)
                .reaches
                .iter()
                .find_map(|reach| match reach {
                    Reach::Warp(place) => Some(*place),
                    _ => None,
                })?;
            Some(ProbeExit {
                name: object.name.clone().unwrap_or_default(),
                to: warp.area,
                at: object.shape.center(),
                rect: object.shape.bounds(),
            })
        })
        .collect();
    exits.sort_by(|a, b| a.name.cmp(&b.name));
    exits
}

fn ui(world: &mut World) -> Vec<ProbeUiElement> {
    let spans: HashMap<Entity, String> = world
        .query::<(Entity, &TextSpan)>()
        .iter(world)
        .map(|(entity, span)| (entity, span.0.clone()))
        .collect();
    let focused = world.get_resource::<InputFocus>().and_then(InputFocus::get);
    let mut nodes = world.query::<(
        Entity,
        &ComputedNode,
        &InheritedVisibility,
        Option<&Text>,
        Option<&ui::RichText>,
        Option<&Children>,
        Option<&ImageNode>,
        Option<&EditableText>,
        Has<ui::SliderThumb>,
        &UiGlobalTransform,
        Option<&CalculatedClip>,
    )>();
    let assets = world.resource::<AssetServer>();
    let catalog = world.resource::<ui::InputCatalog>();
    nodes
        .iter(world)
        .filter(|(entity, node, visibility, .., at, clip)| {
            visibility.get()
                && node.size().min_element() > 0.0
                && !leaving(world, *entity)
                && clip.is_none_or(|clip| clip.contains_point(at.translation))
        })
        .filter_map(
            |(entity, _, _, text, rich, children, image, field, thumb, ..)| {
                let text = text
                    .map(|text| {
                        let spanned = children
                            .into_iter()
                            .flatten()
                            .filter_map(|child| spans.get(child).map(String::as_str));
                        std::iter::once(text.0.as_str()).chain(spanned).collect()
                    })
                    .or_else(|| rich.map(|rich| rich.plain(catalog)))
                    .or_else(|| field.map(|field| field.value().to_string()))
                    .filter(|text: &String| !text.is_empty());
                let image = image
                    .and_then(|image| assets.get_path(image.image.id()))
                    .map(|path| path.to_string())
                    .map(|path| {
                        path.strip_prefix("assets/")
                            .map_or(path.clone(), str::to_owned)
                    });
                let slider = thumb
                    .then(|| {
                        ui::self_and_ancestors(world, entity)
                            .find_map(|up| world.get::<ui::SliderState>(up))
                    })
                    .flatten()
                    .map(|state| state.value);
                if text.is_none() && image.is_none() && field.is_none() && slider.is_none() {
                    return None;
                }
                Some(ProbeUiElement {
                    text,
                    image,
                    editable: field.is_some(),
                    focused: focused == Some(entity),
                    click_through: ui::clicks_through(world, entity),
                    slider,
                    rect: window_rect(ui::node_rect(world, entity)?),
                })
            },
        )
        .collect()
}

fn choice_rows(world: &mut World) -> HashMap<usize, Rect<WindowPx>> {
    world
        .query::<(Entity, &ui::ChoiceRow)>()
        .iter(world)
        .filter_map(|(entity, row)| {
            Some((row.index, ui::node_rect(world, entity).map(window_rect)?))
        })
        .collect()
}

fn notifications(world: &mut World) -> ProbeNotifications {
    let content = *world.resource::<Content>();
    let bubbles = bubble::shown(world)
        .into_iter()
        .map(|shown| ProbeBubble {
            speaker: shown.speaker.get(&content).name.to_owned(),
            npc: shown.speaker,
            body: shown.body,
            replaced: shown.replaced,
            lines: shown.lines,
            folded: shown.folded,
            rect: shown
                .drawn
                .and_then(|drawn| ui::node_rect(world, drawn))
                .map(window_rect),
        })
        .collect();
    let edge_folds = bubble::edge_folds(world)
        .into_iter()
        .filter_map(|fold| world.get::<ui::SpeechBubble>(fold))
        .filter_map(|fold| fold.folded_speakers.map(|speakers| speakers.0))
        .collect();
    ProbeNotifications {
        bubbles,
        edge_folds,
        captions: shown_rows::<ui::Captions>(world),
        alerts: shown_rows::<ui::AlertBar>(world),
        error: error::shown(world),
        milestones: shown_rows::<ui::Milestones>(world),
        intro: intro::shown(world).map(|(title, text)| ProbeIntro { title, text }),
    }
}

fn leaving(world: &World, entity: Entity) -> bool {
    ui::self_and_ancestors(world, entity).any(|up| world.get::<ui::Leaving>(up).is_some())
}

fn window_rect(rect: bevy::math::Rect) -> Rect<WindowPx> {
    Rect::new(
        Pos::new(rect.min.x, rect.min.y),
        Size::new(rect.width(), rect.height()),
    )
}

fn covered(world: &mut World) -> Vec<Rect<WindowPx>> {
    let blocking: HashMap<Entity, Rect<WindowPx>> = world
        .query::<(
            Entity,
            &ComputedNode,
            &InheritedVisibility,
            Option<&Pickable>,
        )>()
        .iter(world)
        .filter(|(entity, node, visibility, pickable)| {
            visibility.get()
                && node.size().min_element() > 0.0
                && pickable.is_none_or(|pickable| pickable.is_hoverable)
                && !leaving(world, *entity)
        })
        .map(|(entity, ..)| entity)
        .collect::<Vec<_>>()
        .into_iter()
        .filter_map(|entity| Some((entity, window_rect(ui::node_rect(world, entity)?))))
        .collect();
    blocking
        .iter()
        .filter(|&(&entity, _)| {
            ui::self_and_ancestors(world, entity)
                .skip(1)
                .all(|up| !blocking.contains_key(&up))
        })
        .map(|(_, rect)| *rect)
        .collect()
}
