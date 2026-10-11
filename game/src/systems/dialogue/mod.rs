pub mod stage;

use std::collections::HashSet;
use std::sync::Arc;

use bevy_app::App;
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

use crate::core::assets::AssetRef;
use crate::core::content::{Content, Fixture};
use crate::core::script::{self, Answer, BoxEnding, ChoiceOffer, DialogueView, FlowKey, Reveal};
use crate::core::tiling::Tiles;
use crate::systems::actor::Name;
use crate::systems::actor::bust::Face;
use crate::systems::attention;
use crate::systems::attention::AttentionMark;
use crate::systems::attention::Id as AttentionId;
use crate::systems::combat::Attitude;
use crate::systems::history::{self, HistoryEntry, HistoryMark, HistoryTopic};
use crate::systems::interface::InterfaceSound;
use crate::systems::item::{Inventory, ItemStack};
use crate::systems::notification::{self, Notification, NotificationKind};
use crate::systems::player::{CommandLock, sender_player};
use crate::systems::reach::Tether;
use crate::systems::script::condition;
use crate::systems::script::{
    Condition, EventKind, Line, RiftEffect, RiftEvent, RiftInstances, RiftScripting, Speaker,
};
use crate::systems::stat;
use crate::systems::text::LineText;

pub use crate::core::script::Reveal as ChoiceReveal;

pub fn register(app: &mut App) {
    use bevy_replicon::prelude::*;
    app.replicate::<Conversation>()
        .add_client_message::<ConversationRequest>(Channel::Ordered)
        .init_resource::<StepCounter>();
    attention::badge_source(app, talking);
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ChoiceTag {
    Quest,
    Shop,
    Dialogue,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct ConversationStep(pub u32);

#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Conversation {
    pub step: ConversationStep,
    pub node: String,
    #[entities]
    pub with: Option<Entity>,
    pub lines: Vec<SpokenLine>,
    pub choices: Vec<ChoiceView>,
    pub panel: Option<ConversationPanel>,
    pub refused: Option<RefusedPick>,
    pub remark: Option<Remark>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConversationPanel {
    QuestOffer(crate::systems::quest::Id),
    QuestTurnIn(crate::systems::quest::Id),
    QuestDecision(crate::systems::quest::Id),
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct RefusedPick {
    pub nth: u32,
    pub choice: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Remark {
    pub nth: u32,
    pub line: SpokenLine,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SpokenLine {
    pub by: Speaker,
    pub face: Option<Face>,
    pub text: LineText,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ChoiceView {
    pub label: LineText,
    pub tag: ChoiceTag,
    pub icon: Option<String>,
    pub chips: Vec<ChoiceChip>,
    pub locked: bool,
    pub warn: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ChoiceChip {
    Needs {
        what: String,
        met: bool,
    },
    Pays {
        item: crate::systems::item::Id,
        count: u32,
        have: u32,
    },
    Gets {
        item: crate::systems::item::Id,
        count: u32,
    },
}

#[derive(Message, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum ConversationRequest {
    Pick { step: ConversationStep, choice: u32 },
    Leave { step: ConversationStep },
}

pub type CardPick = Arc<dyn Fn(&mut World, Entity) -> Result<Answer, String> + Send + Sync>;

pub struct CardOffer {
    pub label: LineText,
    pub tag: ChoiceTag,
    pub icon: Option<&'static AssetRef>,
    pub chips: Vec<ChoiceChip>,
    pub locked: bool,
    pub warn: Option<String>,
    pub pick: CardPick,
}

#[derive(Component, Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Heard(HashSet<String>);

impl Heard {
    pub fn has(&self, script: &str, node: &str) -> bool {
        self.0.contains(&heard_key(script, node))
    }
}

pub fn heard(world: &World, player: Entity, script: &str, node: &str) -> bool {
    world
        .get::<Heard>(player)
        .is_some_and(|heard| heard.has(script, node))
}

pub const DEFAULT_REACH: Tiles = Tiles(2.0);

pub struct Revealable {
    pub needs: bool,
    pub costs: bool,
    pub gains: bool,
}

pub fn check_reveal(
    reveal: &[Reveal],
    revealable: Revealable,
) -> Result<(), (&'static str, String)> {
    for kind in reveal {
        let (present, what) = match kind {
            Reveal::Locked | Reveal::Needs => (revealable.needs, "needs"),
            Reveal::Costs => (revealable.costs, "costs"),
            Reveal::Gains => (revealable.gains, "gains"),
        };
        if !present {
            return Err((
                "nothing to reveal",
                format!("reveals {}, {what} nothing", kind.name()),
            ));
        }
    }
    let mut seen = HashSet::new();
    for kind in reveal {
        if !seen.insert(*kind) {
            return Err(("revealed twice", format!("{} twice", kind.name())));
        }
    }
    Ok(())
}

pub fn show(world: &mut World, flow: FlowKey, subject: Entity, view: DialogueView<RiftScripting>) {
    if !begin(world, flow, subject) {
        return;
    }
    let script = view.script.to_owned();
    world
        .entity_mut(subject)
        .entry::<Heard>()
        .or_default()
        .into_mut()
        .0
        .insert(heard_key(&script, view.node));
    let lines: Vec<SpokenLine> = view
        .lines
        .iter()
        .map(|(line, values)| SpokenLine {
            by: line.by,
            face: line.face.clone(),
            text: LineText::spoken(&line.text, values),
        })
        .collect();
    for line in &lines {
        record_line(world, subject, line);
    }
    let offers: Vec<Offer> = view
        .choices
        .iter()
        .map(|choice| Offer {
            view: choice_view(world, subject, choice),
            pick: Pick::Choice {
                index: choice.index,
                requires: choice.requires,
                costs: revealed_costs(choice),
            },
        })
        .collect();
    let panel = view
        .choices
        .iter()
        .flat_map(|choice| choice.leads.iter())
        .find_map(|effect| match effect {
            RiftEffect::Decide(decide) => Some(ConversationPanel::QuestDecision(decide.quest)),
            _ => None,
        });
    let step = next_step(world);
    if let Some(mut session) = world.get_mut::<ConversationSession>(subject) {
        session.step = step;
        session.node = view.node.to_owned();
        session.lines = lines;
        session.offers = offers;
        session.panel = panel;
        session.on_leave = Answer::Left;
        session.answered = false;
        session.refused = None;
        session.remark = None;
    }
    refresh_view(world, subject);
}

pub fn card(
    world: &mut World,
    flow: FlowKey,
    subject: Entity,
    offers: Vec<CardOffer>,
    on_leave: Answer,
    panel: Option<ConversationPanel>,
) -> bool {
    if !begin(world, flow, subject) {
        return false;
    }
    let step = next_step(world);
    if let Some(mut session) = world.get_mut::<ConversationSession>(subject) {
        session.step = step;
        session.panel = panel;
        session.offers = offers
            .into_iter()
            .map(|offer| Offer {
                view: ChoiceView {
                    label: offer.label,
                    tag: offer.tag,
                    icon: offer.icon.map(|icon| icon.path()),
                    chips: offer.chips,
                    locked: offer.locked,
                    warn: offer.warn,
                },
                pick: Pick::Card(offer.pick),
            })
            .collect();
        session.on_leave = on_leave;
        session.answered = false;
        session.refused = None;
    }
    refresh_view(world, subject);
    true
}

pub fn close(world: &mut World, flow: FlowKey, subject: Entity, ending: BoxEnding) {
    let Some(session) = world.get::<ConversationSession>(subject) else {
        return;
    };
    if session.flow != flow {
        return;
    }
    drop_session(world, subject);
    if ending == BoxEnding::Gone {
        tell_ended(world, subject, "they're gone");
    }
}

pub fn close_for(world: &mut World, player: Entity) {
    drop_session(world, player);
}

pub fn remark(world: &mut World, player: Entity, to: Entity, line: &Line) {
    let Some(session) = world.get::<ConversationSession>(player) else {
        return;
    };
    if session.with != Some(to) {
        return;
    }
    let nth = session.remark.as_ref().map_or(0, |remark| remark.nth) + 1;
    let line = SpokenLine {
        by: line.by,
        face: line.face.clone(),
        text: LineText::of(&line.text),
    };
    record_line(world, player, &line);
    if let Some(mut session) = world.get_mut::<ConversationSession>(player) {
        session.remark = Some(Remark { nth, line });
    }
    refresh_view(world, player);
}

pub fn in_conversation(world: &World, player: Entity) -> bool {
    world.get::<ConversationSession>(player).is_some()
}

pub fn engaged_with(world: &World, player: Entity, with: Option<Entity>) -> bool {
    world
        .get::<ConversationSession>(player)
        .is_some_and(|session| session.with == with)
        && broken(world, player).is_none()
}

pub fn flow_of(world: &World, player: Entity) -> Option<FlowKey> {
    world
        .get::<ConversationSession>(player)
        .map(|session| session.flow)
}

pub fn counterpart_of(world: &World, player: Entity) -> Option<Entity> {
    world
        .get::<ConversationSession>(player)
        .and_then(|session| session.with)
}

pub fn requests(world: &mut World) {
    for request in crate::systems::requests::<ConversationRequest>(world) {
        let Some(player) = sender_player(world, request.client_id) else {
            continue;
        };
        match request.message {
            ConversationRequest::Pick { step, choice } => pick(world, player, step, choice),
            ConversationRequest::Leave { step } => {
                if world
                    .get::<ConversationSession>(player)
                    .is_some_and(|session| session.step == step)
                {
                    leave(world, player);
                }
            }
        }
    }
}

pub fn hold(world: &mut World, sessions: &mut QueryState<Entity, With<ConversationSession>>) {
    let players: Vec<Entity> = sessions.iter(world).collect();
    for player in players {
        if let Some(reason) = broken(world, player) {
            leave(world, player);
            tell_ended(world, player, reason);
        }
    }
}

pub fn refresh(world: &mut World, sessions: &mut QueryState<Entity, With<ConversationSession>>) {
    let players: Vec<Entity> = sessions.iter(world).collect();
    for player in players {
        let Some(session) = world.get::<ConversationSession>(player) else {
            continue;
        };
        let flow = session.flow;
        let choices: Vec<(usize, usize)> = session
            .offers
            .iter()
            .enumerate()
            .filter_map(|(index, offer)| match offer.pick {
                Pick::Choice { index: choice, .. } => Some((index, choice)),
                Pick::Card(_) => None,
            })
            .collect();
        for (index, choice) in choices {
            let locked =
                !script::run::choice_open::<RiftScripting>(world, flow, choice).unwrap_or(true);
            if let Some(mut session) = world.get_mut::<ConversationSession>(player) {
                session.offers[index].view.locked = locked;
            }
        }
        refresh_view(world, player);
    }
}

pub fn speaker_name(world: &World, player: Entity, who: Speaker) -> Option<String> {
    let content = world.resource::<Content>();
    match who {
        Speaker::Npc(npc) => Some(npc.get(content).name.to_owned()),
        Speaker::Object => counterpart_of(world, player)
            .and_then(|with| world.get::<Name>(with))
            .map(|name| name.name.clone()),
        Speaker::Narrator | Speaker::Player => None,
    }
}

#[derive(Component)]
pub struct ConversationSession {
    step: ConversationStep,
    flow: FlowKey,
    node: String,
    with: Option<Entity>,
    tether: Option<Tether>,
    lines: Vec<SpokenLine>,
    offers: Vec<Offer>,
    panel: Option<ConversationPanel>,
    on_leave: Answer,
    answered: bool,
    refused: Option<RefusedPick>,
    refusals: u32,
    remark: Option<Remark>,
}

struct Offer {
    view: ChoiceView,
    pick: Pick,
}

enum Pick {
    Choice {
        index: usize,
        requires: Option<&'static Condition>,
        costs: Vec<ItemStack>,
    },
    Card(CardPick),
}

#[derive(Resource, Default)]
struct StepCounter(u32);

fn heard_key(script: &str, node: &str) -> String {
    format!("{script}#{node}")
}

fn begin(world: &mut World, flow: FlowKey, subject: Entity) -> bool {
    if let Some(session) = world.get::<ConversationSession>(subject) {
        if session.flow == flow {
            return true;
        }
        let old = session.flow;
        drop_session(world, subject);
        world
            .resource_mut::<RiftInstances>()
            .answer(old, Answer::Left);
    }
    if stat::is_dead(world, subject) {
        return false;
    }
    let with = flow.owner.entity();
    let reach = world
        .resource::<RiftInstances>()
        .entries(flow.owner, EventKind::Interacted)
        .filter_map(|event| match event {
            RiftEvent::Interacted { reach, .. } => Some(reach.0),
            _ => None,
        })
        .fold(None, |most: Option<f32>, reach| {
            Some(most.map_or(reach, |most| most.max(reach)))
        })
        .map_or(DEFAULT_REACH, Tiles);
    let tether = with.and_then(|with| Tether::around(world, subject, reach, Some(with)));
    crate::systems::reach::forget(world, subject);
    let step = next_step(world);
    world.entity_mut(subject).insert((
        ConversationSession {
            step,
            flow,
            node: String::new(),
            with,
            tether,
            lines: Vec::new(),
            offers: Vec::new(),
            panel: None,
            on_leave: Answer::Left,
            answered: false,
            refused: None,
            refusals: 0,
            remark: None,
        },
        CommandLock,
    ));
    let name = with
        .and_then(|with| world.get::<Name>(with))
        .map(|name| name.name.clone());
    history::record(
        world,
        subject,
        HistoryEntry::of(HistoryTopic::Talk, LineText::default())
            .by(name)
            .mark(Some(HistoryMark::Began)),
    );
    true
}

fn drop_session(world: &mut World, player: Entity) {
    if let Some(session) = world.entity_mut(player).take::<ConversationSession>() {
        world
            .resource_mut::<RiftInstances>()
            .box_closed(session.flow);
    }
    world
        .entity_mut(player)
        .remove::<(Conversation, CommandLock)>();
}

fn leave(world: &mut World, player: Entity) {
    let Some(session) = world.get::<ConversationSession>(player) else {
        return;
    };
    let (flow, answer) = (session.flow, session.on_leave.clone());
    drop_session(world, player);
    world.resource_mut::<RiftInstances>().answer(flow, answer);
}

fn tell_ended(world: &mut World, player: Entity, reason: &str) {
    notification::notify(
        world,
        player,
        Notification::new(
            NotificationKind::Error {
                sfx: Some(InterfaceSound::UiClose.id(world.resource::<Content>())),
            },
            LineText::plain(format!("Conversation ended: {reason}")),
        ),
    );
}

fn record_line(world: &mut World, player: Entity, line: &SpokenLine) {
    let by = speaker_name(world, player, line.by);
    history::record(
        world,
        player,
        HistoryEntry::of(HistoryTopic::Talk, line.text.clone()).by(by),
    );
}

fn choice_view(world: &World, player: Entity, choice: &ChoiceOffer<RiftScripting>) -> ChoiceView {
    let inventory = world.get::<Inventory>(player);
    let have = |item| inventory.map_or(0, |inventory| inventory.count(item));
    let mut chips = Vec::new();
    if choice.reveal.contains(&Reveal::Needs)
        && let Some(requires) = choice.requires
    {
        for part in condition::parts(requires) {
            chips.push(ChoiceChip::Needs {
                what: condition::describe(world.resource::<Content>(), part),
                met: condition::holds(world, player, part),
            });
        }
    }
    let items = choice.leads.iter().find_map(|effect| match effect {
        RiftEffect::Items(items) => Some(items),
        _ => None,
    });
    if let Some(items) = items {
        if choice.reveal.contains(&Reveal::Costs) {
            for stack in &items.take {
                chips.push(ChoiceChip::Pays {
                    item: stack.item,
                    count: stack.count,
                    have: have(stack.item),
                });
            }
        }
        if choice.reveal.contains(&Reveal::Gains) {
            for stack in &items.give {
                chips.push(ChoiceChip::Gets {
                    item: stack.item,
                    count: stack.count,
                });
            }
        }
    }
    ChoiceView {
        label: LineText::of(choice.label),
        tag: ChoiceTag::Dialogue,
        icon: None,
        chips,
        locked: choice.locked,
        warn: choice.warn.map(str::to_owned),
    }
}

fn refresh_view(world: &mut World, player: Entity) {
    let Some(session) = world.get::<ConversationSession>(player) else {
        return;
    };
    let view = Conversation {
        step: session.step,
        node: session.node.clone(),
        with: session.with,
        lines: session.lines.clone(),
        choices: session
            .offers
            .iter()
            .map(|offer| offer.view.clone())
            .collect(),
        panel: session.panel,
        refused: session.refused.clone(),
        remark: session.remark.clone(),
    };
    if world.get::<Conversation>(player) != Some(&view) {
        world.entity_mut(player).insert(view);
    }
}

const LOCKED: &str = "You can't do that yet.";
const NO_LONGER: &str = "You can't do that any more.";

fn pick(world: &mut World, player: Entity, step: ConversationStep, choice: u32) {
    let Some(session) = world.get::<ConversationSession>(player) else {
        return;
    };
    if session.step != step || session.answered {
        return;
    }
    let Some(offer) = session.offers.get(choice as usize) else {
        return;
    };
    let flow = session.flow;
    let label = offer.view.label.clone();
    let picked = match &offer.pick {
        Pick::Choice {
            index,
            requires,
            costs,
        } => Picked::Choice {
            index: *index,
            requires: *requires,
            costs: costs.clone(),
        },
        Pick::Card(card) => Picked::Card(card.clone()),
    };
    if let Some(reason) = broken(world, player) {
        leave(world, player);
        tell_ended(world, player, reason);
        return;
    }
    let said = HistoryEntry::of(HistoryTopic::Talk, label)
        .by(world.get::<Name>(player).map(|name| name.name.clone()))
        .mark(Some(HistoryMark::You));
    history::record(world, player, said);
    let answer = match picked {
        Picked::Choice {
            index,
            requires,
            costs,
        } => match script::run::choice_open::<RiftScripting>(world, flow, index) {
            Some(true) => affordable(world, player, &costs).map(|()| Answer::Pick(index)),
            Some(false) => Err(unmet(world, player, requires)),
            None => Err(NO_LONGER.to_owned()),
        },
        Picked::Card(card) => card(world, player),
    };
    match answer {
        Ok(answer) => {
            if let Some(mut session) = world.get_mut::<ConversationSession>(player) {
                session.answered = true;
            }
            world.resource_mut::<RiftInstances>().answer(flow, answer);
        }
        Err(reason) => refuse(world, player, choice, reason),
    }
}

enum Picked {
    Choice {
        index: usize,
        requires: Option<&'static Condition>,
        costs: Vec<ItemStack>,
    },
    Card(CardPick),
}

fn revealed_costs(choice: &ChoiceOffer<RiftScripting>) -> Vec<ItemStack> {
    if !choice.reveal.contains(&Reveal::Costs) {
        return Vec::new();
    }
    choice
        .leads
        .iter()
        .find_map(|effect| match effect {
            RiftEffect::Items(items) => Some(items.take.to_vec()),
            _ => None,
        })
        .unwrap_or_default()
}

fn affordable(world: &World, player: Entity, costs: &[ItemStack]) -> Result<(), String> {
    if costs.is_empty() {
        return Ok(());
    }
    let content = world.resource::<Content>();
    world
        .get::<Inventory>(player)
        .cloned()
        .unwrap_or_else(Inventory::empty)
        .exchange(content, costs, &[])
        .map_err(|refusal| refusal.describe(content))
}

fn unmet(world: &World, player: Entity, requires: Option<&'static Condition>) -> String {
    let content = world.resource::<Content>();
    requires
        .into_iter()
        .flat_map(condition::parts)
        .find(|part| !condition::holds(world, player, part))
        .map_or_else(
            || LOCKED.to_owned(),
            |part| format!("Needs {}", condition::describe(content, part)),
        )
}

fn refuse(world: &mut World, player: Entity, choice: u32, reason: String) {
    notification::notify(
        world,
        player,
        Notification::new(
            NotificationKind::error(world.resource::<Content>()),
            LineText::plain(reason),
        ),
    );
    if let Some(mut session) = world.get_mut::<ConversationSession>(player) {
        session.refusals += 1;
        session.refused = Some(RefusedPick {
            nth: session.refusals,
            choice,
        });
    }
    refresh_view(world, player);
}

fn talking(world: &World, player: Entity) -> Option<AttentionId> {
    in_conversation(world, player).then_some(AttentionMark::Talking.id(world.resource::<Content>()))
}

fn broken(world: &World, player: Entity) -> Option<&'static str> {
    let session = world.get::<ConversationSession>(player)?;
    if stat::is_dead(world, player) {
        return Some("you died");
    }
    if let Some(with) = session.with {
        if world.get_entity(with).is_err() || stat::is_dead(world, with) {
            return Some("they're gone");
        }
        if world.get::<Attitude>(with) == Some(&Attitude::Hostile) {
            return Some("they turned hostile");
        }
    }
    session
        .tether
        .filter(|tether| !tether.holds(world, player))
        .map(|_| "you walked out of reach")
}

fn next_step(world: &mut World) -> ConversationStep {
    let mut counter = world.resource_mut::<StepCounter>();
    counter.0 = counter.0.wrapping_add(1);
    ConversationStep(counter.0)
}
