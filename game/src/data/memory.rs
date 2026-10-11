use crate::core::script::ValueType;
use crate::systems::memory::{MemoryDef, Resets};

crate::table! {
    TobbVisits: MemoryDef {
        label: "Visits to Tobb",
        ty: ValueType::Integer,
        resets: Resets::Never,
    },
    TobbGaveLure: MemoryDef {
        label: "Tobb's lucky lure",
        ty: ValueType::Boolean,
        resets: Resets::Never,
    },
    TobbNewsToday: MemoryDef {
        label: "Heard Tobb's news today",
        ty: ValueType::Boolean,
        resets: Resets::Daily,
    },
    TideChestLooted: MemoryDef {
        label: "Emptied the tide chest today",
        ty: ValueType::Boolean,
        resets: Resets::Daily,
    },
    InnFavour: MemoryDef {
        label: "Favour at the inn",
        ty: ValueType::Integer,
        resets: Resets::Never,
    },
    PellGrudge: MemoryDef {
        label: "Pell's grudge",
        ty: ValueType::Boolean,
        resets: Resets::Never,
    },
    PellFighting: MemoryDef {
        label: "Fighting Pell",
        ty: ValueType::Boolean,
        resets: Resets::LeavingArea,
    },
    PellDead: MemoryDef {
        label: "Pell defeated",
        ty: ValueType::Boolean,
        resets: Resets::Never,
    },
    BribedIlsa: MemoryDef {
        label: "Bribed Ilsa",
        ty: ValueType::Boolean,
        resets: Resets::Never,
    },
    SidedWithOrcs: MemoryDef {
        label: "Sided with the orcs",
        ty: ValueType::Boolean,
        resets: Resets::Never,
    },
    FoundTatteredMap: MemoryDef {
        label: "Found the tattered map",
        ty: ValueType::Boolean,
        resets: Resets::Never,
    },
    SpurnedUgra: MemoryDef {
        label: "Turned Ugra away",
        ty: ValueType::Boolean,
        resets: Resets::Never,
    },
    HeardGulls: MemoryDef {
        label: "Heard the gulls",
        ty: ValueType::Boolean,
        resets: Resets::Never,
    },
    ChiefTauntedYou: MemoryDef {
        label: "Taunted by an Orc Chief",
        ty: ValueType::Boolean,
        resets: Resets::Never,
    },
}
