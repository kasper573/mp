pub mod alert;
pub mod bubble;
pub mod budget;
pub mod caption;
pub mod error;
pub mod feed;
pub mod intro;
pub mod milestone;
mod rows;

use std::borrow::Cow;

use bevy::ecs::entity::MapEntities;
use bevy::ecs::message::MessageCursor;
use bevy::prelude::*;
use bevy::scene::EntityScene;
use bevy_replicon::prelude::{SendTargets, ToClients};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::assets::AssetRef;
use crate::core::audio::playback::SfxId;
use crate::core::audio::playback::{PlaySfx, SfxPlace};
use crate::core::content::{Content, ContentId, Fixture, Loading, RowCheck};
use crate::core::math::Pos;
use crate::core::platform::ClientPlatform;
use crate::core::script::{
    Compiler, EffectCall, EffectDef, EffectStep, Name, OwnerKind, ValueType,
};
use crate::core::tiling::Tiles;
use crate::core::time::{Seconds, UnixMillis, WallClock};
use crate::systems::actor::Rgba;
use crate::systems::history::{self, HistoryEntry, HistoryMark, HistoryTopic, RecordTally};
use crate::systems::interface::InterfaceSound;
use crate::systems::movement::position;
use crate::systems::npc::Id as NpcId;
use crate::systems::npc::{Npc, NpcDef};
use crate::systems::player::Players;
use crate::systems::scene::Scene as GameScene;
use crate::systems::script::condition;
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow, Link};
use crate::systems::script::{Reach, RiftScripting};
use crate::systems::text::{self, LineText, Motion, Span, SpanText};
use crate::systems::visibility;

pub type NotificationId = ContentId<NotificationDef>;
pub type Id = NotificationId;
pub use intro::IntroAppearance;
pub use rows::{NotificationRow, NotificationRows};

const READING_BASE: Seconds = Seconds(2.0);
const READING_PER_WORD: Seconds = Seconds(0.3);
const LATE_AFTER: Seconds = Seconds(2.0);
const LONGEST_ROW_WORDS: usize = 30;

pub fn register(app: &mut bevy_app::App) {
    use bevy_replicon::prelude::*;
    app.add_mapped_server_message::<NotificationSent>(Channel::Ordered)
        .add_server_message::<SoundPlayed>(Channel::Ordered)
        .init_resource::<Broadcasts>();
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Notification {
    pub kind: NotificationKind,
    pub text: LineText,
    pub lasts: Option<Seconds>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum NotificationKind {
    Speech {
        speaker: NpcId,
    },
    Narration {
        label: Cow<'static, str>,
        sfx: Option<SfxId>,
    },
    Alert {
        label: Cow<'static, str>,
        sfx: Option<SfxId>,
    },
    Error {
        sfx: Option<SfxId>,
    },
    Milestone {
        label: Cow<'static, str>,
        topic: HistoryTopic,
        sfx: Option<SfxId>,
    },
    Intro {
        title: Cow<'static, str>,
        appearance: IntroAppearance,
        sfx: Option<SfxId>,
    },
    Feed {
        topic: HistoryTopic,
        icon: Option<String>,
        tally: Option<RecordTally>,
        failure: bool,
        sfx: Option<SfxId>,
    },
}

impl NotificationKind {
    pub fn error(content: &Content) -> NotificationKind {
        NotificationKind::Error {
            sfx: Some(InterfaceSound::UiRefuse.id(content)),
        }
    }

    fn sfx(&self) -> Option<SfxId> {
        match self {
            NotificationKind::Speech { .. } => None,
            NotificationKind::Narration { sfx, .. }
            | NotificationKind::Alert { sfx, .. }
            | NotificationKind::Error { sfx }
            | NotificationKind::Milestone { sfx, .. }
            | NotificationKind::Intro { sfx, .. }
            | NotificationKind::Feed { sfx, .. } => *sfx,
        }
    }
}

#[derive(Message, Serialize, Deserialize, MapEntities, Clone, Debug, PartialEq)]
pub struct NotificationSent {
    pub notification: Notification,
    #[entities]
    pub speaker: Option<Entity>,
    pub at: UnixMillis,
}

pub fn notify(world: &mut World, player: Entity, notification: Notification) {
    notify_from(world, player, None, notification);
}

pub fn notify_from(
    world: &mut World,
    player: Entity,
    speaker: Option<Entity>,
    notification: Notification,
) {
    record(world, player, &notification);
    let at = world.resource::<WallClock>().now;
    let speaker = speaker.filter(|&npc| notification.spoken_by(world, npc));
    let live = match notification.kind {
        NotificationKind::Feed { .. } | NotificationKind::Error { .. } => true,
        _ => budget::admit(world, player, &notification, speaker, at) == budget::Admit::Live,
    };
    if live {
        visibility::send_private(
            world,
            player,
            NotificationSent {
                notification,
                speaker,
                at,
            },
        );
    }
}

pub fn record(world: &mut World, player: Entity, notification: &Notification) {
    let entry = notification.history_entry(world.resource::<Content>());
    history::record(world, player, entry);
}

impl Notification {
    pub fn new(kind: NotificationKind, text: LineText) -> Notification {
        Notification {
            kind,
            text,
            lasts: None,
        }
    }

    pub fn stays(&self) -> Seconds {
        self.lasts.unwrap_or_else(|| {
            let words = self.text.word_count() as f32;
            Seconds(READING_BASE.0 + READING_PER_WORD.0 * words)
        })
    }

    fn spoken_by(&self, world: &World, npc: Entity) -> bool {
        match self.kind {
            NotificationKind::Speech { speaker } => {
                world.get::<Npc>(npc).is_some_and(|npc| npc.def == speaker)
            }
            _ => false,
        }
    }

    fn history_entry(&self, content: &Content) -> HistoryEntry {
        let entry = |topic: HistoryTopic, by: Option<&str>| {
            HistoryEntry::of(topic, self.text.clone()).by(by.map(str::to_owned))
        };
        match &self.kind {
            NotificationKind::Speech { speaker } => entry(
                HistoryTopic::Notification,
                Some(speaker.get(content).name.as_str()),
            ),
            NotificationKind::Narration { label, .. } | NotificationKind::Alert { label, .. } => {
                entry(HistoryTopic::Notification, Some(label))
            }
            NotificationKind::Error { .. } => entry(HistoryTopic::Error, None),
            NotificationKind::Milestone { label, topic, .. } => entry(*topic, Some(label)),
            NotificationKind::Intro { title, .. } => entry(HistoryTopic::Notification, Some(title)),
            NotificationKind::Feed {
                topic,
                icon,
                tally,
                failure,
                ..
            } => entry(*topic, None)
                .icon(icon.clone())
                .tally(*tally)
                .mark(failure.then_some(HistoryMark::Failed)),
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct NotificationDef {
    #[schemars(with = "NotificationKindRow")]
    #[serde(
        serialize_with = "notification_kind",
        deserialize_with = "notification_kind_from"
    )]
    pub kind: NotificationKind,
    pub text: Vec<Span>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lasts: Option<Seconds>,
}

#[derive(JsonSchema, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum NotificationKindRow {
    Speech {
        speaker: NpcId,
    },
    Narration {
        label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sfx: Option<SfxId>,
    },
    Intro {
        title: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tint: Option<[u8; 4]>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        motion: Option<Motion>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        emblem: Option<AssetRef>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sfx: Option<SfxId>,
    },
}

fn notification_kind<S: serde::Serializer>(
    kind: &NotificationKind,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    let row = match kind {
        NotificationKind::Speech { speaker } => NotificationKindRow::Speech { speaker: *speaker },
        NotificationKind::Narration { label, sfx } => NotificationKindRow::Narration {
            label: label.to_string(),
            sfx: *sfx,
        },
        NotificationKind::Intro {
            title,
            appearance,
            sfx,
        } => NotificationKindRow::Intro {
            title: title.to_string(),
            tint: appearance.tint.map(|tint| tint.0.to_be_bytes()),
            motion: appearance.motion,
            emblem: appearance.emblem.clone(),
            sfx: *sfx,
        },
        NotificationKind::Alert { .. }
        | NotificationKind::Error { .. }
        | NotificationKind::Milestone { .. }
        | NotificationKind::Feed { .. } => {
            return Err(serde::ser::Error::custom(
                "only speech, narration and intro notifications are content",
            ));
        }
    };
    row.serialize(serializer)
}

fn notification_kind_from<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<NotificationKind, D::Error> {
    Ok(match NotificationKindRow::deserialize(deserializer)? {
        NotificationKindRow::Speech { speaker } => NotificationKind::Speech { speaker },
        NotificationKindRow::Narration { label, sfx } => NotificationKind::Narration {
            label: Cow::Owned(label),
            sfx,
        },
        NotificationKindRow::Intro {
            title,
            tint,
            motion,
            emblem,
            sfx,
        } => NotificationKind::Intro {
            title: Cow::Owned(title),
            appearance: IntroAppearance {
                tint: tint.map(|bytes| Rgba(u32::from_be_bytes(bytes))),
                motion,
                emblem,
            },
            sfx,
        },
    })
}

impl crate::core::content::ContentRow for NotificationDef {
    const TABLE: &'static str = "notification";
}

impl NotificationDef {
    pub fn for_player(&'static self, world: &World, player: Entity) -> Notification {
        Notification {
            kind: self.kind.clone(),
            text: condition::spoken(world, player, &self.text),
            lasts: self.lasts,
        }
    }

    fn speaker(&self) -> Option<NpcId> {
        match self.kind {
            NotificationKind::Speech { speaker } => Some(speaker),
            _ => None,
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Notify {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub notification: NotificationId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for Notify {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, &self.who)?;
        let def = self.notification.get(cx.content);
        let values = text::values(&def.text)
            .into_iter()
            .map(|value| cx.expr(value, ValueType::Text).map_err(effects::bad))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Box::new(move |world, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                let spoken: Vec<_> = values.iter().map(|value| value(world, cx)).collect();
                let notification = Notification {
                    kind: def.kind.clone(),
                    text: LineText::spoken(&def.text, &spoken),
                    lasts: def.lasts,
                };
                notify_from(world, player, cx.owner.entity(), notification);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Notifies(self.notification)]
    }
}

#[derive(Message, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct SoundPlayed {
    pub sfx: SfxId,
    pub at: Option<Pos<Tiles>>,
}

pub fn play_sound(
    world: &mut World,
    owner: Option<Entity>,
    subject: Option<Entity>,
    sfx: SfxId,
    everyone: bool,
) {
    let source = owner.or(subject);
    let at = source.and_then(|source| position(world, source));
    let played = SoundPlayed { sfx, at };
    if everyone {
        let Some(source) = source else {
            return;
        };
        for client in visibility::seen_by(world, source) {
            world.write_message(ToClients {
                targets: SendTargets::Single(bevy_replicon::prelude::ClientId::Client(client)),
                message: played,
            });
        }
    } else if let Some(subject) = subject {
        visibility::send_private(world, subject, played);
    }
}

pub fn speakers(content: &Content) -> impl Iterator<Item = NpcId> + '_ {
    content
        .table::<NotificationDef>()
        .rows()
        .filter_map(NotificationDef::speaker)
}

pub fn check_all(loading: &mut Loading) {
    let content = loading.content();
    for (id, def) in loading.rows::<NotificationDef>() {
        let mut check = RowCheck::default();
        for (index, span) in def.text.iter().enumerate() {
            if let Span::Value { value, .. } = span
                && let Err((rule, expected)) = condition::check_value(&content, value)
            {
                check.error(format!("/text/{index}/value"), rule, "the value", expected);
            }
        }
        let words: usize = def
            .text
            .iter()
            .map(|span| match span {
                Span::Text { text, .. } => text.split_whitespace().count(),
                Span::Input(_) | Span::Value { .. } => 1,
            })
            .sum();
        if words > LONGEST_ROW_WORDS {
            check.error(
                "/text",
                "too many words",
                format!("{words} words"),
                format!("at most {LONGEST_ROW_WORDS} words, a value counting as one"),
            );
        }
        if let Some(speaker) = def.speaker()
            && content.table::<NpcDef>().get(speaker).is_some()
            && speaker.get(&content).voice().is_none()
        {
            check.error(
                "/kind/speaker",
                "needs a voice",
                speaker.key(&content),
                "an npc with a voice module",
            );
        }
        loading.row_errors(id, check);
    }
}

#[derive(Resource, Default)]
pub struct Broadcasts(Vec<Notification>);

pub fn broadcast(world: &mut World, notification: Notification) {
    world.resource_mut::<Broadcasts>().0.push(notification);
}

pub fn relay(worlds: &mut [&mut World]) {
    let raised: Vec<Notification> = worlds
        .iter_mut()
        .flat_map(|world| std::mem::take(&mut world.resource_mut::<Broadcasts>().0))
        .collect();
    for notification in &raised {
        notify_everywhere(worlds, notification);
    }
}

pub fn notify_everywhere(worlds: &mut [&mut World], notification: &Notification) {
    for world in worlds.iter_mut() {
        let players: Vec<Entity> = world.resource::<Players>().0.values().copied().collect();
        for player in players {
            notify(world, player, notification.clone());
        }
    }
}

pub struct NotificationPlugin;

impl Plugin for NotificationPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins((
            bubble::BubblePlugin,
            caption::CaptionPlugin,
            alert::AlertPlugin,
            milestone::MilestonePlugin,
            intro::IntroPlugin,
            feed::FeedPlugin,
        ))
        .add_systems(OnEnter(GameScene::Area), spawn_places)
        .add_systems(
            OnExit(GameScene::Area),
            crate::systems::scene::despawn_all::<PlacesRoot>,
        )
        .add_systems(
            Update,
            (deliver, deliver_sounds).run_if(in_state(GameScene::Area)),
        );
    }
}

#[derive(Component, Default, Clone)]
struct PlacesRoot;

const CENTRE_BELOW: f32 = 15.0;

fn spawn_places(mut commands: Commands) {
    commands.spawn_scene(bsn! {
        PlacesRoot
        Node {
            position_type: PositionType::Absolute,
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            align_items: AlignItems::Center,
            padding: {UiRect::top(Val::Px(ui::tokens::spacing::XL))},
        }
        Pickable::IGNORE
        GlobalZIndex({ui::tokens::layer::NOTIFICATIONS})
        Children [
            (
                Node {
                    flex_direction: FlexDirection::Column,
                    align_items: AlignItems::Center,
                    row_gap: Val::Px({ui::tokens::spacing::L}),
                    width: Val::Percent(100.0),
                }
                Pickable::IGNORE
                Children [
                    {EntityScene(ui::alert_bar())},
                    {EntityScene(ui::captions())},
                    (
                        {ui::toaster(ui::SonnerPosition::TopCenter)}
                        error::ErrorToaster
                        Node { position_type: PositionType::Relative, top: Val::Auto, left: Val::Auto, margin: UiRect::ZERO }
                    ),
                ]
            ),
            (
                Node {
                    flex_direction: FlexDirection::Column,
                    align_items: AlignItems::Center,
                    row_gap: Val::Px({ui::tokens::spacing::XL}),
                    width: Val::Percent(100.0),
                    margin: {UiRect::top(Val::Vh(CENTRE_BELOW))},
                }
                Pickable::IGNORE
                Children [
                    ( intro::IntroHost Node { display: Display::Grid, justify_items: JustifyItems::Center } Pickable::IGNORE ),
                    {EntityScene(ui::milestones())},
                ]
            ),
        ]
    });
}

fn deliver(world: &mut World, mut cursor: Local<MessageCursor<NotificationSent>>) {
    let paused = world.resource::<Time<Real>>().delta_secs() > LATE_AFTER.0;
    let now = world.resource::<ClientPlatform>().0.local_clock().now;
    let fresh: Vec<NotificationSent> = cursor
        .read(world.resource::<Messages<NotificationSent>>())
        .cloned()
        .collect();
    for notification_sent in fresh {
        if paused && !notification_sent.outlives_pause(now) {
            continue;
        }
        show(world, notification_sent);
    }
}

fn deliver_sounds(mut played: MessageReader<SoundPlayed>, mut sfx: MessageWriter<PlaySfx>) {
    for sound in played.read() {
        sfx.write(PlaySfx {
            id: sound.sfx,
            place: sound.at.map_or(SfxPlace::Interface, SfxPlace::World),
        });
    }
}

fn show(world: &mut World, notification_sent: NotificationSent) {
    if let Some(id) = notification_sent.notification.kind.sfx() {
        world.write_message(PlaySfx {
            id,
            place: SfxPlace::Interface,
        });
    }
    match notification_sent.notification.kind {
        NotificationKind::Speech { .. } => bubble::say(world, notification_sent),
        NotificationKind::Narration { .. } => caption::join(world, notification_sent),
        NotificationKind::Alert { .. } => alert::raise(world, notification_sent),
        NotificationKind::Error { .. } => error::toast(world, notification_sent),
        NotificationKind::Milestone { .. } => milestone::reach(world, notification_sent),
        NotificationKind::Intro { .. } => intro::show(world, notification_sent),
        NotificationKind::Feed { .. } => feed::show(world, notification_sent),
    }
}

impl NotificationSent {
    fn outlives_pause(&self, now: UnixMillis) -> bool {
        match (&self.notification.kind, self.notification.lasts) {
            (NotificationKind::Feed { .. }, _) => true,
            (_, Some(lasts)) => now < self.at.after(lasts),
            (_, None) => false,
        }
    }
}

pub(crate) fn plain_words(text: &LineText) -> String {
    text.0
        .iter()
        .map(|span| match span {
            SpanText::Text { text, .. } => text.as_str(),
            SpanText::Input(_) => "",
        })
        .collect()
}
