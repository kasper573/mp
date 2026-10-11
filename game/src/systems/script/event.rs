use serde::{Deserialize, Serialize};

use crate::core::content::serial;
use crate::core::script::{EventDef, Name, OwnerKind, ValueType};
use crate::core::tiling::Tiles;
use crate::data;
use crate::systems::interact::Verb;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum EventKind {
    Started,
    Run,
    Entered,
    Left,
    Discovered,
    Died,
    LeveledUp,
    Interacted,
    Heard,
    CameNear,
    Attacked,
    Defeated,
    Used,
    PickedUp,
    Equipped,
    Unequipped,
    Accepted,
    Completed,
    Failed,
    Bought,
    Sold,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Who {
    Characters,
    Npcs,
    Anyone,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum RiftEvent {
    Started,
    Run,
    Entered {
        by: Who,
    },
    Left {
        by: Who,
    },
    Discovered,
    Died {
        by: Who,
    },
    LeveledUp,
    Interacted {
        verb: Verb,
        reach: Tiles,
        #[serde(skip_serializing_if = "serial::is_empty")]
        marks: &'static [data::attention::Id],
        #[serde(skip_serializing_if = "serial::is_false")]
        news: bool,
    },
    Heard {
        words: &'static [Name],
        within: Tiles,
    },
    CameNear {
        within: Tiles,
        by: Who,
        #[serde(skip_serializing_if = "Option::is_none")]
        npc: Option<data::npc::Id>,
    },
    Attacked,
    Defeated,
    Used,
    PickedUp,
    Equipped,
    Unequipped,
    Accepted,
    Completed,
    Failed,
    Bought {
        #[serde(skip_serializing_if = "Option::is_none")]
        item: Option<data::item::Id>,
    },
    Sold {
        #[serde(skip_serializing_if = "Option::is_none")]
        item: Option<data::item::Id>,
    },
}

const PLACED: &[OwnerKind] = &[
    OwnerKind::Object,
    OwnerKind::Npc,
    OwnerKind::Area,
    OwnerKind::Blueprint,
];
const OBJECT_OR_AREA: &[OwnerKind] = &[OwnerKind::Object, OwnerKind::Area];
const OBJECT_OR_NPC: &[OwnerKind] = &[OwnerKind::Object, OwnerKind::Npc];
const AREA: &[OwnerKind] = &[OwnerKind::Area];
const NPC: &[OwnerKind] = &[OwnerKind::Npc];
const ITEM: &[OwnerKind] = &[OwnerKind::Item];
const QUEST: &[OwnerKind] = &[OwnerKind::Quest];
const SHOP: &[OwnerKind] = &[OwnerKind::Shop];
const ANY: &[OwnerKind] = &[OwnerKind::Any];

const TRADE_FIELDS: &[(Name, ValueType)] =
    &[("item", ValueType::Integer), ("count", ValueType::Integer)];

impl EventDef for RiftEvent {
    type Kind = EventKind;

    fn kind(&self) -> EventKind {
        match self {
            RiftEvent::Started => EventKind::Started,
            RiftEvent::Run => EventKind::Run,
            RiftEvent::Entered { .. } => EventKind::Entered,
            RiftEvent::Left { .. } => EventKind::Left,
            RiftEvent::Discovered => EventKind::Discovered,
            RiftEvent::Died { .. } => EventKind::Died,
            RiftEvent::LeveledUp => EventKind::LeveledUp,
            RiftEvent::Interacted { .. } => EventKind::Interacted,
            RiftEvent::Heard { .. } => EventKind::Heard,
            RiftEvent::CameNear { .. } => EventKind::CameNear,
            RiftEvent::Attacked => EventKind::Attacked,
            RiftEvent::Defeated => EventKind::Defeated,
            RiftEvent::Used => EventKind::Used,
            RiftEvent::PickedUp => EventKind::PickedUp,
            RiftEvent::Equipped => EventKind::Equipped,
            RiftEvent::Unequipped => EventKind::Unequipped,
            RiftEvent::Accepted => EventKind::Accepted,
            RiftEvent::Completed => EventKind::Completed,
            RiftEvent::Failed => EventKind::Failed,
            RiftEvent::Bought { .. } => EventKind::Bought,
            RiftEvent::Sold { .. } => EventKind::Sold,
        }
    }

    fn owners(&self) -> &'static [OwnerKind] {
        match self {
            RiftEvent::Started => PLACED,
            RiftEvent::Run => ANY,
            RiftEvent::Entered { .. } | RiftEvent::Left { .. } => OBJECT_OR_AREA,
            RiftEvent::Discovered | RiftEvent::Died { .. } | RiftEvent::LeveledUp => AREA,
            RiftEvent::Interacted { .. } | RiftEvent::Heard { .. } => OBJECT_OR_NPC,
            RiftEvent::CameNear { .. } | RiftEvent::Attacked | RiftEvent::Defeated => NPC,
            RiftEvent::Used | RiftEvent::PickedUp | RiftEvent::Equipped | RiftEvent::Unequipped => {
                ITEM
            }
            RiftEvent::Accepted | RiftEvent::Completed | RiftEvent::Failed => QUEST,
            RiftEvent::Bought { .. } | RiftEvent::Sold { .. } => SHOP,
        }
    }

    fn has_subject(&self) -> bool {
        !matches!(self, RiftEvent::Started)
    }

    fn is_run(&self) -> bool {
        matches!(self, RiftEvent::Run)
    }

    fn fields(&self) -> &'static [(Name, ValueType)] {
        match self {
            RiftEvent::Bought { .. } | RiftEvent::Sold { .. } => TRADE_FIELDS,
            _ => &[],
        }
    }
}

impl EventKind {
    pub fn name(self) -> &'static str {
        match self {
            EventKind::Started => "started",
            EventKind::Run => "run",
            EventKind::Entered => "entered",
            EventKind::Left => "left",
            EventKind::Discovered => "discovered",
            EventKind::Died => "died",
            EventKind::LeveledUp => "leveled_up",
            EventKind::Interacted => "interacted",
            EventKind::Heard => "heard",
            EventKind::CameNear => "came_near",
            EventKind::Attacked => "attacked",
            EventKind::Defeated => "defeated",
            EventKind::Used => "used",
            EventKind::PickedUp => "picked_up",
            EventKind::Equipped => "equipped",
            EventKind::Unequipped => "unequipped",
            EventKind::Accepted => "accepted",
            EventKind::Completed => "completed",
            EventKind::Failed => "failed",
            EventKind::Bought => "bought",
            EventKind::Sold => "sold",
        }
    }
}

impl Who {
    pub fn admits(self, is_npc: bool) -> bool {
        match self {
            Who::Characters => !is_npc,
            Who::Npcs => is_npc,
            Who::Anyone => true,
        }
    }
}
