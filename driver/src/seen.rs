use engine::core::content::Fixture;
use engine::core::math::{Pos, Rect, WindowPx};
use engine::core::render::transition::ScreenTransitionPhase;
use engine::core::tiling::{TilePos, Tiles};
use engine::systems::actor::Action;
use engine::systems::area::AreaDef;
use engine::systems::attention::AttentionMark;
use engine::systems::history::HistoryTopic;
use engine::systems::item::ItemDef;
use engine::systems::npc::NpcDef;
use engine::systems::probe::{
    ProbeBody, ProbeExit, ProbeFixture, ProbeQuest, ProbeSnapshot, ProbeUiElement,
};
use engine::systems::quest::{QuestDef, QuestResult};

use crate::content::{content, id};

// What a snapshot shows, asked by content name.

pub fn in_world(snapshot: &ProbeSnapshot) -> bool {
    snapshot.me.is_some()
        && snapshot.view.is_some()
        && snapshot.area.is_some()
        && snapshot.transition == ScreenTransitionPhase::Idle
}

// The probe names the new area as soon as the character is there; the crossing's transition is
// still uncovering it until the screen settles.
pub fn arrived_in(snapshot: &ProbeSnapshot, area: &str) -> bool {
    snapshot.area == Some(id::<AreaDef>(area)) && in_world(snapshot)
}

pub fn area_key(snapshot: &ProbeSnapshot) -> Option<&'static str> {
    snapshot.area.map(|area| area.key(content()))
}

pub fn at_rest(body: &ProbeBody) -> bool {
    body.action == Action::Idle && body.at.on_center()
}

pub fn me_at_rest(snapshot: &ProbeSnapshot) -> bool {
    snapshot.me.as_ref().is_some_and(at_rest)
}

pub fn townsperson<'a>(snapshot: &'a ProbeSnapshot, npc: &str) -> Option<&'a ProbeBody> {
    let npc = id::<NpcDef>(npc);
    snapshot.actors.iter().find(|actor| actor.npc == Some(npc))
}

// The fallen don't count.
pub fn nearest_npc<'a>(snapshot: &'a ProbeSnapshot, npc: &str) -> Option<&'a ProbeBody> {
    let me = snapshot.me.as_ref()?.at;
    snapshot
        .actors
        .iter()
        .filter(|actor| actor.health > 0.0 && npc_is(actor, npc))
        .min_by(|a, b| a.at.distance_to(me).total_cmp(&b.at.distance_to(me)))
}

pub fn npc_is(body: &ProbeBody, npc: &str) -> bool {
    body.npc == Some(id::<NpcDef>(npc))
}

pub fn marked(snapshot: &ProbeSnapshot, npc: &str, mark: AttentionMark) -> bool {
    let mark = mark.id(content());
    townsperson(snapshot, npc).is_some_and(|body| body.marks.contains(&mark))
}

pub fn fixture<'a>(snapshot: &'a ProbeSnapshot, name: &str) -> Option<&'a ProbeFixture> {
    snapshot
        .props
        .iter()
        .find(|prop| prop.name.as_deref() == Some(name))
}

pub fn portal<'a>(snapshot: &'a ProbeSnapshot, name: &str) -> &'a ProbeExit {
    snapshot
        .portals
        .iter()
        .find(|portal| portal.name == name)
        .unwrap_or_else(|| panic!("no warp named {name} here"))
}

pub fn holding(snapshot: &ProbeSnapshot, item: &str) -> u32 {
    let item = id::<ItemDef>(item);
    snapshot
        .bag
        .iter()
        .filter(|stack| stack.item == item)
        .map(|stack| stack.count)
        .sum()
}

pub fn carried(snapshot: &ProbeSnapshot) -> u32 {
    snapshot.bag.iter().map(|stack| stack.count).sum()
}

pub fn on_quest<'a>(snapshot: &'a ProbeSnapshot, quest: &str) -> Option<&'a ProbeQuest> {
    let quest = id::<QuestDef>(quest);
    snapshot
        .quests
        .active
        .iter()
        .find(|active| active.quest == quest)
}

pub fn finished(snapshot: &ProbeSnapshot, quest: &str) -> Option<QuestResult> {
    let quest = id::<QuestDef>(quest);
    snapshot
        .quests
        .finished
        .iter()
        .find(|done| done.quest == quest)
        .map(|done| done.result)
}

// Notices come and go: on a machine too busy to draw every frame, one can be up and gone between two
// of them. History keeps every one, so it is how to tell that a notice came.
pub fn noticed(snapshot: &ProbeSnapshot, row: &str) -> bool {
    snapshot
        .history
        .records
        .iter()
        .any(|record| record.text == row)
}

// A notice that says whom or what it's from: narration, alerts, milestones, intros, and words called
// out loud rather than said in a conversation.
pub fn told_by(snapshot: &ProbeSnapshot, by: &str) -> bool {
    snapshot
        .history
        .records
        .iter()
        .any(|record| record.topic != HistoryTopic::Talk && record.by.as_deref() == Some(by))
}

pub fn erred(snapshot: &ProbeSnapshot, saying: &str) -> bool {
    snapshot
        .history
        .records
        .iter()
        .any(|record| record.topic == HistoryTopic::Error && record.text.contains(saying))
}

// Where the tile shows in the window, if it does, clear of the interface over it.
pub fn clickable_point(snapshot: &ProbeSnapshot, tile: Pos<Tiles>) -> Option<Pos<WindowPx>> {
    let point = snapshot.view?.window_point(tile);
    let window = Rect::from_size(snapshot.screen?);
    (window.contains(point) && !snapshot.covered.iter().any(|cover| cover.contains(point)))
        .then_some(point)
}

// Ground a click walks onto: in view, and clear of anyone or anything a click would use instead.
pub fn open(snapshot: &ProbeSnapshot, tile: Pos<Tiles>) -> bool {
    clickable_point(snapshot, tile).is_some() && !taken(snapshot, tile)
}

// Someone or something stands there, or lies there.
pub fn taken(snapshot: &ProbeSnapshot, tile: Pos<Tiles>) -> bool {
    snapshot
        .actors
        .iter()
        .any(|actor| actor.hitbox.contains(tile))
        || snapshot.props.iter().any(|prop| prop.hitbox.contains(tile))
        || snapshot
            .items
            .iter()
            .any(|item| item.at.cell() == tile.cell())
}

// Anyone walking can step under the pointer between the frame that shows ground clear and the click
// landing there, so ground within a tile of them is left alone while they pass.
pub fn passed_by(snapshot: &ProbeSnapshot, tile: Pos<Tiles>) -> bool {
    let me = snapshot.me.as_ref().map(|me| me.id);
    snapshot
        .actors
        .iter()
        .filter(|actor| Some(actor.id) != me && matches!(actor.action, Action::Walk | Action::Run))
        .any(|actor| actor.hitbox.inflate(PASSING.0, PASSING.0).contains(tile))
}

const PASSING: Tiles = Tiles(1.0);

// Stepping into a warp takes it.
pub fn in_warp(snapshot: &ProbeSnapshot, tile: Pos<Tiles>) -> bool {
    snapshot
        .portals
        .iter()
        .any(|portal| portal.rect.contains(tile))
}

// A piece of the interface, picked out by what it says or shows, or by where it sits.
pub struct UiTarget {
    describe: String,
    test: UiTest,
}

type UiTest = Box<dyn Fn(&ProbeUiElement, &ProbeSnapshot) -> bool>;

impl UiTarget {
    pub fn text(text: &str) -> UiTarget {
        let text = text.to_owned();
        UiTarget::new(format!("{text:?}"), move |element, _| {
            element.text.as_deref() == Some(text.as_str())
        })
    }

    pub fn text_field() -> UiTarget {
        UiTarget::new("the text field", |element, _| element.editable)
    }

    pub fn typing_field() -> UiTarget {
        UiTarget::text_field().and("with focus", |element, _| element.focused)
    }

    // A clickable row or tab: a button named by its text, where the same text may show as a label too.
    pub fn button(text: &str) -> UiTarget {
        let text = text.to_owned();
        UiTarget::new(format!("button {text:?}"), move |element, _| {
            element.button && element.text.as_deref() == Some(text.as_str())
        })
    }

    pub fn starting(prefix: &str) -> UiTarget {
        let prefix = prefix.to_owned();
        UiTarget::new(format!("{prefix:?}…"), move |element, _| {
            element
                .text
                .as_deref()
                .is_some_and(|text| text.starts_with(&prefix))
        })
    }

    pub fn containing(part: &str) -> UiTarget {
        let part = part.to_owned();
        UiTarget::new(format!("…{part:?}…"), move |element, _| {
            element
                .text
                .as_deref()
                .is_some_and(|text| text.contains(&part))
        })
    }

    pub fn image(path: &str) -> UiTarget {
        let path = path.to_owned();
        UiTarget::new(path.clone(), move |element, _| {
            element.image.as_deref() == Some(path.as_str())
        })
    }

    pub fn new(
        describe: impl Into<String>,
        test: impl Fn(&ProbeUiElement, &ProbeSnapshot) -> bool + 'static,
    ) -> UiTarget {
        UiTarget {
            describe: describe.into(),
            test: Box::new(test),
        }
    }

    // Narrowed to the copies that also pass `also`.
    pub fn and(
        self,
        describe: &str,
        also: impl Fn(&ProbeUiElement, &ProbeSnapshot) -> bool + 'static,
    ) -> UiTarget {
        let UiTarget {
            describe: first,
            test,
        } = self;
        UiTarget::new(format!("{first} {describe}"), move |element, snapshot| {
            test(element, snapshot) && also(element, snapshot)
        })
    }

    pub fn find<'a>(&self, snapshot: &'a ProbeSnapshot) -> Option<&'a ProbeUiElement> {
        snapshot
            .ui
            .iter()
            .find(|element| self.matches(element, snapshot))
    }

    pub fn matches(&self, element: &ProbeUiElement, snapshot: &ProbeSnapshot) -> bool {
        (self.test)(element, snapshot)
    }

    pub fn describe(&self) -> &str {
        &self.describe
    }
}

impl From<&str> for UiTarget {
    fn from(text: &str) -> UiTarget {
        UiTarget::text(text)
    }
}
