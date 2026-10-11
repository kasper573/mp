use crate::core::babble::BabbleId;
use crate::core::math::Pos;
use crate::core::script::{Arrow, Assignment, Expr, Name, Target, ValueType, VarValue};
use crate::core::tiling::Tiles;
use crate::core::time::{Millis, Seconds};
use crate::data::area::Id as AreaId;
use crate::data::attention::Id as AttentionId;
use crate::data::expression::Id as ExpressionId;
use crate::data::item::Id as ItemId;
use crate::data::memory::Id as MemoryId;
use crate::data::model::Id as ModelId;
use crate::data::notification::Id as NotificationId;
use crate::data::quest::Id as QuestId;
use crate::data::script::Id as ScriptId;
use crate::data::shop::Id as ShopId;
use crate::systems::actor::bust::Face::{Generic, Individual};
use crate::systems::actor::bust::GenericExpression::{
    Angry, Happy, Neutral, Sad, Surprised, Thinking,
};
use crate::systems::actor::{Rgba, Tint};
use crate::systems::area::warp::Warp;
use crate::systems::chat::Say;
use crate::systems::dialogue::ChoiceReveal::{Costs, Locked, Needs};
use crate::systems::interact::Verb;
use crate::systems::item::ItemStack;
use crate::systems::item::effects::Items;
use crate::systems::memory::{Forget, Remember};
use crate::systems::notification::Notify;
use crate::systems::npc::summon::{ShownFor, SpawnNear, SpawnNpcs};
use crate::systems::npc::{Loot, LootItem, Nameplate, NpcDef, NpcModule, Respawn, Voice};
use crate::systems::quest::effects::{AcceptQuest, Decide, FailQuest, TurnIn};
use crate::systems::script::Speaker::{Narrator, Npc};
use crate::systems::script::{
    Choice, Condition, DialogueNode, Fill, InlineScript, Line, Node, Place, RiftEffect, RiftEvent,
    RiftQuery, ScriptModule, Who, choice,
};
use crate::systems::shop::OpenShop;
use crate::systems::stat::StatKind;
use crate::systems::stat::effects::{Heal, HealBy};
use crate::systems::text::{Fx, Ink, Motion, Span, Voice as Tone, plain, styled, value};

crate::table! {
    Orc: NpcDef {
        name: "Orc",
        model: ModelId::Orc,
        stats: &[
            StatKind::Health.of(25.0),
            StatKind::MaxHealth.of(25.0),
            StatKind::Damage.of(3.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 12, items: &[LootItem { item: ItemId::Gold, amount: 3, chance: None }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: None }, LootItem { item: ItemId::OrcTusk, amount: 1, chance: Some(50.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatDefensive, values: &[("aggro", VarValue::Number(7.0))] }),
        ],
    },
    OrcChief: NpcDef {
        name: "Orc Chief",
        model: ModelId::Orc,
        stats: &[
            StatKind::Health.of(60.0),
            StatKind::MaxHealth.of(60.0),
            StatKind::Damage.of(6.0),
            StatKind::AttackSpeed.of(0.8),
            StatKind::AttackDelay.of(600.0),
            StatKind::Range.of(1.2),
            StatKind::MovementSpeed.of(1.2),
        ],
        modules: &[
            NpcModule::Tint(Tint { rgba: Rgba(0xffb070ff) }),
            NpcModule::Voice(Voice { babble: BabbleId::OrcChief }),
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 40, items: &[LootItem { item: ItemId::Gold, amount: 12, chance: None }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(75.0) }, LootItem { item: ItemId::OrcTusk, amount: 1, chance: None }, LootItem { item: ItemId::TribalHelmet, amount: 1, chance: Some(10.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatProtective, values: &[("aggro", VarValue::Number(9.0))] }),
            NpcModule::Script(ScriptModule::Inline(ORC_CHIEF)),
        ],
    },
    Skeleton: NpcDef {
        name: "Skeleton",
        model: ModelId::Skeleton,
        stats: &[
            StatKind::Health.of(18.0),
            StatKind::MaxHealth.of(18.0),
            StatKind::Damage.of(3.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 10, items: &[LootItem { item: ItemId::Gold, amount: 2, chance: Some(70.0) }, LootItem { item: ItemId::Bone, amount: 2, chance: Some(80.0) }, LootItem { item: ItemId::RustySword, amount: 1, chance: Some(15.0) }, LootItem { item: ItemId::BoneShield, amount: 1, chance: Some(2.5) }, LootItem { item: ItemId::FruloosRock, amount: 1, chance: Some(0.01) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(8.0))] }),
        ],
    },
    Bat: NpcDef {
        name: "Bat",
        model: ModelId::Bat,
        stats: &[
            StatKind::Health.of(8.0),
            StatKind::MaxHealth.of(8.0),
            StatKind::Damage.of(1.0),
            StatKind::AttackSpeed.of(1.5),
            StatKind::AttackDelay.of(300.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.25),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 4, items: &[LootItem { item: ItemId::Gold, amount: 1, chance: Some(50.0) }, LootItem { item: ItemId::BatWing, amount: 4, chance: Some(65.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatPacifist, values: &[] }),
        ],
    },
    VampireBat: NpcDef {
        name: "Vampire Bat",
        model: ModelId::Bat,
        stats: &[
            StatKind::Health.of(12.0),
            StatKind::MaxHealth.of(12.0),
            StatKind::Damage.of(2.0),
            StatKind::AttackSpeed.of(2.0),
            StatKind::AttackDelay.of(200.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.5),
        ],
        modules: &[
            NpcModule::Tint(Tint { rgba: Rgba(0xff7788ff) }),
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 8, items: &[LootItem { item: ItemId::Gold, amount: 2, chance: Some(60.0) }, LootItem { item: ItemId::BatWing, amount: 2, chance: Some(65.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(25.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(8.0))] }),
        ],
    },
    Mara: NpcDef {
        name: "Mara",
        model: ModelId::Mara,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Merchant" }),
            NpcModule::Voice(Voice { babble: BabbleId::Mara }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
            NpcModule::Script(ScriptModule::Inline(MARA)),
        ],
    },
    Tobb: NpcDef {
        name: "Tobb",
        model: ModelId::Tobb,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Fisherman" }),
            NpcModule::Voice(Voice { babble: BabbleId::Tobb }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::IdleStroll, values: &[] }),
            NpcModule::Script(ScriptModule::Inline(TOBB)),
        ],
    },
    Grisha: NpcDef {
        name: "Grisha",
        model: ModelId::Grisha,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Innkeeper" }),
            NpcModule::Voice(Voice { babble: BabbleId::Grisha }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::IdleStroll, values: &[] }),
            NpcModule::Script(ScriptModule::Inline(GRISHA)),
        ],
    },
    Bram: NpcDef {
        name: "Bram",
        model: ModelId::Bram,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Harbour Captain" }),
            NpcModule::Voice(Voice { babble: BabbleId::Bram }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
            NpcModule::Script(ScriptModule::Inline(BRAM)),
        ],
    },
    Wren: NpcDef {
        name: "Wren",
        model: ModelId::Wren,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Bone Collector" }),
            NpcModule::Voice(Voice { babble: BabbleId::Wren }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::IdleStroll, values: &[] }),
            NpcModule::Script(ScriptModule::Inline(WREN)),
        ],
    },
    Pell: NpcDef {
        name: "Pell",
        model: ModelId::Pell,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Gambler" }),
            NpcModule::Voice(Voice { babble: BabbleId::Pell }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
            NpcModule::Script(ScriptModule::Inline(PELL)),
        ],
    },
    Ilsa: NpcDef {
        name: "Ilsa",
        model: ModelId::Ilsa,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Road Warden" }),
            NpcModule::Voice(Voice { babble: BabbleId::Ilsa }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
            NpcModule::Script(ScriptModule::Inline(ILSA)),
        ],
    },
    Ugra: NpcDef {
        name: "Ugra",
        model: ModelId::Ugra,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Clan Shaman" }),
            NpcModule::Voice(Voice { babble: BabbleId::Ugra }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
            NpcModule::Script(ScriptModule::Inline(UGRA)),
        ],
    },
    HarbourGuard: NpcDef {
        name: "Harbour Guard",
        model: ModelId::Guard,
        stats: &[
            StatKind::Health.of(30.0),
            StatKind::MaxHealth.of(30.0),
            StatKind::Damage.of(3.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(500.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.1),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Town Watch" }),
            NpcModule::Loot(Loot { xp: 10, items: &[] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(10.0))] }),
        ],
    },
    PellHostile: NpcDef {
        name: "Pell",
        model: ModelId::Pell,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.1),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Gambler" }),
            NpcModule::Voice(Voice { babble: BabbleId::Pell }),
            NpcModule::Loot(Loot { xp: 25, items: &[LootItem { item: ItemId::Gold, amount: 15, chance: None }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(10.0))] }),
            NpcModule::Script(ScriptModule::Inline(PELL_HOSTILE)),
        ],
    },
    DireWolf: NpcDef {
        name: "Dire Wolf",
        model: ModelId::DireWolf,
        stats: &[
            StatKind::Health.of(26.0),
            StatKind::MaxHealth.of(26.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.2),
            StatKind::AttackDelay.of(350.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.3),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 14, items: &[LootItem { item: ItemId::Gold, amount: 3, chance: Some(60.0) }, LootItem { item: ItemId::Bone, amount: 1, chance: Some(50.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(20.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(8.0))] }),
        ],
    },
    FrostWraith: NpcDef {
        name: "Frost Wraith",
        model: ModelId::FrostWraith,
        stats: &[
            StatKind::Health.of(34.0),
            StatKind::MaxHealth.of(34.0),
            StatKind::Damage.of(5.0),
            StatKind::AttackSpeed.of(0.9),
            StatKind::AttackDelay.of(500.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.9),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 20, items: &[LootItem { item: ItemId::Gold, amount: 5, chance: None }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(15.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(9.0))] }),
        ],
    },
    Scorpion: NpcDef {
        name: "Scorpion",
        model: ModelId::Scorpion,
        stats: &[
            StatKind::Health.of(18.0),
            StatKind::MaxHealth.of(18.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.1),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.1),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 11, items: &[LootItem { item: ItemId::Gold, amount: 2, chance: Some(70.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(20.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatDefensive, values: &[("aggro", VarValue::Number(6.0))] }),
        ],
    },
    SandMummy: NpcDef {
        name: "Sand Mummy",
        model: ModelId::SandMummy,
        stats: &[
            StatKind::Health.of(38.0),
            StatKind::MaxHealth.of(38.0),
            StatKind::Damage.of(5.0),
            StatKind::AttackSpeed.of(0.8),
            StatKind::AttackDelay.of(600.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 22, items: &[LootItem { item: ItemId::Gold, amount: 6, chance: None }, LootItem { item: ItemId::Bone, amount: 2, chance: Some(60.0) }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(15.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(8.0))] }),
        ],
    },
    Trapper: NpcDef {
        name: "Trapper",
        model: ModelId::Trapper,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Fur Trapper" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::IdleStroll, values: &[] }),
        ],
    },
    Huntress: NpcDef {
        name: "Huntress",
        model: ModelId::Huntress,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Hunter" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Jarl: NpcDef {
        name: "Jarl",
        model: ModelId::Jarl,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Chieftain" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    NomadMerchant: NpcDef {
        name: "Nomad Merchant",
        model: ModelId::NomadMerchant,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Caravan Trader" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Potter: NpcDef {
        name: "Potter",
        model: ModelId::Potter,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Potter" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    SilkPrince: NpcDef {
        name: "Silk Prince",
        model: ModelId::SilkPrince,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Silk Merchant" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    WildBoar: NpcDef {
        name: "Wild Boar",
        model: ModelId::WildBoar,
        stats: &[
            StatKind::Health.of(22.0),
            StatKind::MaxHealth.of(22.0),
            StatKind::Damage.of(3.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.2),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 10, items: &[LootItem { item: ItemId::Gold, amount: 2, chance: Some(70.0) }, LootItem { item: ItemId::Bone, amount: 1, chance: Some(40.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(15.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatDefensive, values: &[("aggro", VarValue::Number(6.0))] }),
        ],
    },
    GiantBee: NpcDef {
        name: "Giant Bee",
        model: ModelId::GiantBee,
        stats: &[
            StatKind::Health.of(10.0),
            StatKind::MaxHealth.of(10.0),
            StatKind::Damage.of(2.0),
            StatKind::AttackSpeed.of(1.6),
            StatKind::AttackDelay.of(250.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.4),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 6, items: &[LootItem { item: ItemId::Gold, amount: 1, chance: Some(50.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(10.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(7.0))] }),
        ],
    },
    BrownBear: NpcDef {
        name: "Brown Bear",
        model: ModelId::BrownBear,
        stats: &[
            StatKind::Health.of(45.0),
            StatKind::MaxHealth.of(45.0),
            StatKind::Damage.of(6.0),
            StatKind::AttackSpeed.of(0.8),
            StatKind::AttackDelay.of(550.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.1),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 24, items: &[LootItem { item: ItemId::Gold, amount: 4, chance: None }, LootItem { item: ItemId::Bone, amount: 2, chance: Some(50.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(25.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatDefensive, values: &[("aggro", VarValue::Number(6.0))] }),
        ],
    },
    Goblin: NpcDef {
        name: "Goblin",
        model: ModelId::Goblin,
        stats: &[
            StatKind::Health.of(20.0),
            StatKind::MaxHealth.of(20.0),
            StatKind::Damage.of(3.0),
            StatKind::AttackSpeed.of(1.2),
            StatKind::AttackDelay.of(350.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.2),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 12, items: &[LootItem { item: ItemId::Gold, amount: 3, chance: Some(80.0) }, LootItem { item: ItemId::RustySword, amount: 1, chance: Some(5.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(20.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(8.0))] }),
        ],
    },
    Kitsune: NpcDef {
        name: "Kitsune",
        model: ModelId::Kitsune,
        stats: &[
            StatKind::Health.of(24.0),
            StatKind::MaxHealth.of(24.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.2),
            StatKind::AttackDelay.of(350.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.4),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 14, items: &[LootItem { item: ItemId::Gold, amount: 3, chance: Some(70.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(20.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(9.0))] }),
        ],
    },
    Ronin: NpcDef {
        name: "Ronin",
        model: ModelId::Ronin,
        stats: &[
            StatKind::Health.of(34.0),
            StatKind::MaxHealth.of(34.0),
            StatKind::Damage.of(5.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.1),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 20, items: &[LootItem { item: ItemId::Gold, amount: 5, chance: None }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(25.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(8.0))] }),
        ],
    },
    BogLurker: NpcDef {
        name: "Bog Lurker",
        model: ModelId::BogLurker,
        stats: &[
            StatKind::Health.of(32.0),
            StatKind::MaxHealth.of(32.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(0.9),
            StatKind::AttackDelay.of(500.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 16, items: &[LootItem { item: ItemId::Gold, amount: 3, chance: Some(60.0) }, LootItem { item: ItemId::Bone, amount: 1, chance: Some(40.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(20.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(7.0))] }),
        ],
    },
    SwampSlime: NpcDef {
        name: "Swamp Slime",
        model: ModelId::SwampSlime,
        stats: &[
            StatKind::Health.of(16.0),
            StatKind::MaxHealth.of(16.0),
            StatKind::Damage.of(2.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 8, items: &[LootItem { item: ItemId::Gold, amount: 2, chance: Some(50.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(15.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatDefensive, values: &[("aggro", VarValue::Number(5.0))] }),
        ],
    },
    Myconid: NpcDef {
        name: "Myconid",
        model: ModelId::Myconid,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(5.0),
            StatKind::AttackSpeed.of(0.8),
            StatKind::AttackDelay.of(550.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 22, items: &[LootItem { item: ItemId::Gold, amount: 5, chance: None }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(10.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatDefensive, values: &[("aggro", VarValue::Number(6.0))] }),
        ],
    },
    GlowMoth: NpcDef {
        name: "Glow Moth",
        model: ModelId::GlowMoth,
        stats: &[
            StatKind::Health.of(14.0),
            StatKind::MaxHealth.of(14.0),
            StatKind::Damage.of(3.0),
            StatKind::AttackSpeed.of(1.5),
            StatKind::AttackDelay.of(250.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.3),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 10, items: &[LootItem { item: ItemId::Gold, amount: 2, chance: Some(60.0) }, LootItem { item: ItemId::HealthPotion, amount: 1, chance: Some(15.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(8.0))] }),
        ],
    },
    Panther: NpcDef {
        name: "Panther",
        model: ModelId::Panther,
        stats: &[
            StatKind::Health.of(30.0),
            StatKind::MaxHealth.of(30.0),
            StatKind::Damage.of(5.0),
            StatKind::AttackSpeed.of(1.3),
            StatKind::AttackDelay.of(300.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.4),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 20, items: &[LootItem { item: ItemId::Gold, amount: 4, chance: Some(70.0) }, LootItem { item: ItemId::Bone, amount: 1, chance: Some(40.0) }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(10.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(9.0))] }),
        ],
    },
    Lizardman: NpcDef {
        name: "Lizardman",
        model: ModelId::Lizardman,
        stats: &[
            StatKind::Health.of(38.0),
            StatKind::MaxHealth.of(38.0),
            StatKind::Damage.of(5.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.1),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 22, items: &[LootItem { item: ItemId::Gold, amount: 6, chance: None }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(15.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(8.0))] }),
        ],
    },
    Ghost: NpcDef {
        name: "Ghost",
        model: ModelId::Ghost,
        stats: &[
            StatKind::Health.of(30.0),
            StatKind::MaxHealth.of(30.0),
            StatKind::Damage.of(5.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(450.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 22, items: &[LootItem { item: ItemId::Gold, amount: 5, chance: None }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(15.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(9.0))] }),
        ],
    },
    Ghoul: NpcDef {
        name: "Ghoul",
        model: ModelId::Ghoul,
        stats: &[
            StatKind::Health.of(42.0),
            StatKind::MaxHealth.of(42.0),
            StatKind::Damage.of(6.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(450.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 26, items: &[LootItem { item: ItemId::Gold, amount: 6, chance: None }, LootItem { item: ItemId::Bone, amount: 2, chance: Some(60.0) }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(15.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(8.0))] }),
        ],
    },
    MagmaImp: NpcDef {
        name: "Magma Imp",
        model: ModelId::MagmaImp,
        stats: &[
            StatKind::Health.of(34.0),
            StatKind::MaxHealth.of(34.0),
            StatKind::Damage.of(6.0),
            StatKind::AttackSpeed.of(1.3),
            StatKind::AttackDelay.of(300.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.3),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 26, items: &[LootItem { item: ItemId::Gold, amount: 6, chance: None }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(20.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatAggressive, values: &[("aggro", VarValue::Number(9.0))] }),
        ],
    },
    LavaGolem: NpcDef {
        name: "Lava Golem",
        model: ModelId::LavaGolem,
        stats: &[
            StatKind::Health.of(90.0),
            StatKind::MaxHealth.of(90.0),
            StatKind::Damage.of(10.0),
            StatKind::AttackSpeed.of(0.6),
            StatKind::AttackDelay.of(700.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(1.0),
        ],
        modules: &[
            NpcModule::Respawn(Respawn { after: Seconds(5.0) }),
            NpcModule::Loot(Loot { xp: 60, items: &[LootItem { item: ItemId::Gold, amount: 15, chance: None }, LootItem { item: ItemId::GreaterHealthPotion, amount: 1, chance: Some(40.0) }] }),
            NpcModule::Script(ScriptModule::Shared { script: ScriptId::CombatDefensive, values: &[("aggro", VarValue::Number(6.0))] }),
        ],
    },
    EelFisher: NpcDef {
        name: "Eel Fisher",
        model: ModelId::EelFisher,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Fisherman" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    DwarfMiner: NpcDef {
        name: "Dwarf Miner",
        model: ModelId::DwarfMiner,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Miner" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    FarmerGirl: NpcDef {
        name: "Farmer Girl",
        model: ModelId::FarmerGirl,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Farmer" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Explorer: NpcDef {
        name: "Explorer",
        model: ModelId::Explorer,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Explorer" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Lumberjack: NpcDef {
        name: "Lumberjack",
        model: ModelId::Lumberjack,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Woodcutter" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Monk: NpcDef {
        name: "Monk",
        model: ModelId::Monk,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Wandering Monk" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Gravedigger: NpcDef {
        name: "Gravedigger",
        model: ModelId::Gravedigger,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Gravedigger" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    GnomeAlchemist: NpcDef {
        name: "Gnome Alchemist",
        model: ModelId::GnomeAlchemist,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Alchemist" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    FisherBoy: NpcDef {
        name: "Fisher Boy",
        model: ModelId::FisherBoy,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Fisher" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    SwampWitch: NpcDef {
        name: "Swamp Witch",
        model: ModelId::SwampWitch,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Witch" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Blacksmith: NpcDef {
        name: "Blacksmith",
        model: ModelId::Blacksmith,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Smith" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    FirePriestess: NpcDef {
        name: "Fire Priestess",
        model: ModelId::FirePriestess,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Priestess" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Baker: NpcDef {
        name: "Baker",
        model: ModelId::Baker,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Baker" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Miller: NpcDef {
        name: "Miller",
        model: ModelId::Miller,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Miller" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Shaman: NpcDef {
        name: "Shaman",
        model: ModelId::Shaman,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Shaman" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Archaeologist: NpcDef {
        name: "Archaeologist",
        model: ModelId::Archaeologist,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Archaeologist" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    OldWoodsman: NpcDef {
        name: "Old Woodsman",
        model: ModelId::OldWoodsman,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Woodsman" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Farmhand: NpcDef {
        name: "Farmhand",
        model: ModelId::Farmhand,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Farmhand" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    SamuraiLord: NpcDef {
        name: "Samurai Lord",
        model: ModelId::SamuraiLord,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Lord" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    TeaMaster: NpcDef {
        name: "Tea Master",
        model: ModelId::TeaMaster,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Tea Master" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Priest: NpcDef {
        name: "Priest",
        model: ModelId::Priest,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Priest" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    CryptKeeper: NpcDef {
        name: "Crypt Keeper",
        model: ModelId::CryptKeeper,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Keeper" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Fairy: NpcDef {
        name: "Fairy",
        model: ModelId::Fairy,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Fairy" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
    Druid: NpcDef {
        name: "Druid",
        model: ModelId::Druid,
        stats: &[
            StatKind::Health.of(40.0),
            StatKind::MaxHealth.of(40.0),
            StatKind::Damage.of(4.0),
            StatKind::AttackSpeed.of(1.0),
            StatKind::AttackDelay.of(400.0),
            StatKind::Range.of(1.0),
            StatKind::MovementSpeed.of(0.6),
        ],
        modules: &[
            NpcModule::Nameplate(Nameplate { role: "Druid" }),
            NpcModule::Respawn(Respawn { after: Seconds(300.0) }),
        ],
    },
}

const LEVEL: Condition = Expr::Query(RiftQuery::Level { of: None });
const LEVEL_2: Condition = Expr::AtLeast(&LEVEL, &Expr::Int(2));
const LEVEL_3: Condition = Expr::AtLeast(&LEVEL, &Expr::Int(3));
const ROAD_PASSES: Condition = Expr::Query(RiftQuery::Holding {
    of: None,
    item: ItemId::RoadPass,
});
const HOLDS_ROAD_PASS: Condition = Expr::AtLeast(&ROAD_PASSES, &Expr::Int(1));
const WEARS_TRIBAL_HELMET: Condition = Expr::Query(RiftQuery::Wearing {
    of: None,
    item: ItemId::TribalHelmet,
});
const SIDED_WITH_ORCS: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::SidedWithOrcs,
});
const SPURNED_UGRA: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::SpurnedUgra,
});
const TOBB_VISITS: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::TobbVisits,
});
const TOBB_VISITED_LATELY: Condition = Expr::Query(RiftQuery::SetWithin {
    of: None,
    memory: MemoryId::TobbVisits,
    seconds: &Expr::Int(600),
});
const TOBB_GAVE_LURE: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::TobbGaveLure,
});
const TOBB_NEWS_TODAY: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::TobbNewsToday,
});
const INN_FAVOUR: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::InnFavour,
});
const INN_FAVOUR_LATELY: Condition = Expr::Query(RiftQuery::SetWithin {
    of: None,
    memory: MemoryId::InnFavour,
    seconds: &Expr::Int(300),
});
const INN_REGULAR: Condition = Expr::AtLeast(&INN_FAVOUR, &Expr::Int(3));
const INN_PATRON: Condition = Expr::AtLeast(&INN_FAVOUR, &Expr::Int(1));
const PELL_GRUDGE_LATELY: Condition = Expr::Query(RiftQuery::SetWithin {
    of: None,
    memory: MemoryId::PellGrudge,
    seconds: &Expr::Int(1800),
});
const CHIEF_TAUNTED_LATELY: Condition = Expr::Query(RiftQuery::SetWithin {
    of: None,
    memory: MemoryId::ChiefTauntedYou,
    seconds: &Expr::Int(120),
});
const ON_TUSKS: Condition = Expr::Query(RiftQuery::OnQuest {
    of: None,
    quest: QuestId::TusksForTheChief,
});
const TUSKS_DONE: Condition = Expr::Query(RiftQuery::QuestDone {
    of: None,
    quest: QuestId::TusksForTheChief,
});
const ON_PLEA: Condition = Expr::Query(RiftQuery::OnQuest {
    of: None,
    quest: QuestId::ShamansPlea,
});
const PLEA_DONE: Condition = Expr::Query(RiftQuery::QuestDone {
    of: None,
    quest: QuestId::ShamansPlea,
});
const ON_FALLEN: Condition = Expr::Query(RiftQuery::OnQuest {
    of: None,
    quest: QuestId::RestForTheFallen,
});
const FALLEN_DONE: Condition = Expr::Query(RiftQuery::QuestDone {
    of: None,
    quest: QuestId::RestForTheFallen,
});
const ON_LETTER: Condition = Expr::Query(RiftQuery::OnQuest {
    of: None,
    quest: QuestId::LetterForTheCaptain,
});
const LETTER_DONE: Condition = Expr::Query(RiftQuery::QuestDone {
    of: None,
    quest: QuestId::LetterForTheCaptain,
});
const ON_BATS: Condition = Expr::Query(RiftQuery::OnQuest {
    of: None,
    quest: QuestId::BatsInTheBelfry,
});
const BATS_DONE: Condition = Expr::Query(RiftQuery::QuestDone {
    of: None,
    quest: QuestId::BatsInTheBelfry,
});
const BATS_OPEN: Condition = Expr::All(&[Expr::AtLeast(&LEVEL, &Expr::Int(3)), LETTER_DONE]);
const ON_LOW_TIDE: Condition = Expr::Query(RiftQuery::OnQuest {
    of: None,
    quest: QuestId::LowTide,
});
const LOW_TIDE_DONE: Condition = Expr::Query(RiftQuery::QuestDone {
    of: None,
    quest: QuestId::LowTide,
});
const ON_TITHE: Condition = Expr::Query(RiftQuery::OnQuest {
    of: None,
    quest: QuestId::BoneTithe,
});
const TITHE_COOLING: Condition = Expr::Query(RiftQuery::QuestCooling {
    of: None,
    quest: QuestId::BoneTithe,
});
const TITHE_RESETS_IN: Condition = Expr::Query(RiftQuery::QuestResetsIn {
    of: None,
    quest: QuestId::BoneTithe,
});
const ONE_MORE: Condition = Expr::Int(1);
const VISITS: Condition = Expr::Local("visits");
const ROAD_PASS: &[ItemStack] = &[ItemStack::new(ItemId::RoadPass, 1)];

const fn talk(next: Name) -> Node {
    Node::On {
        event: RiftEvent::Interacted {
            verb: Verb::Talk,
            reach: Tiles(2.0),
            marks: &[],
            news: false,
        },
        next: Some(next),
    }
}

const fn accept(quest: QuestId) -> Node {
    Node::Effect(RiftEffect::AcceptQuest(AcceptQuest {
        who: None,
        quest,
        done: None,
        refused: None,
    }))
}

const fn turn_in(quest: QuestId, done: Name, refused: Name) -> Node {
    Node::Effect(RiftEffect::TurnIn(TurnIn {
        who: None,
        quest,
        done: Some(done),
        refused: Some(refused),
        cancelled: None,
    }))
}

const fn remember(memory: MemoryId, next: Name) -> Node {
    Node::Effect(RiftEffect::Remember(Remember {
        who: None,
        memory,
        to: None,
        next: Some(next),
    }))
}

const fn notify(notification: NotificationId, next: Arrow) -> Node {
    Node::Effect(RiftEffect::Notify(Notify {
        who: None,
        notification,
        next,
    }))
}

const fn pay(take: &'static [ItemStack], done: Name) -> Node {
    Node::Effect(RiftEffect::Items(Items {
        who: None,
        take,
        give: &[],
        done: Some(done),
        refused: None,
    }))
}

const fn gain(give: &'static [ItemStack], done: Name) -> Node {
    Node::Effect(RiftEffect::Items(Items {
        who: None,
        take: &[],
        give,
        done: Some(done),
        refused: None,
    }))
}

const fn tell(lines: &'static [Line], choices: &'static [Choice]) -> Node {
    Node::Dialogue(DialogueNode {
        lines,
        choices,
        next: None,
        left: None,
    })
}

const fn tell_then(lines: &'static [Line], next: Name) -> Node {
    Node::Dialogue(DialogueNode {
        lines,
        choices: &[],
        next: Some(next),
        left: None,
    })
}

const fn topic(label: &'static [Span], requires: Condition, to: Name) -> Choice {
    Choice {
        label,
        requires: Some(requires),
        reveal: &[],
        warn: None,
        to: Some(to),
    }
}

const ORC_CHIEF: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "came_near",
            Node::On {
                event: RiftEvent::CameNear {
                    within: Tiles(8.0),
                    by: Who::Characters,
                    npc: None,
                },
                next: Some("hunting_me"),
            },
        ),
        (
            "hunting_me",
            Node::If {
                test: Expr::All(&[ON_TUSKS, Expr::Not(&CHIEF_TAUNTED_LATELY)]),
                yes: Some("taunted"),
                no: None,
            },
        ),
        ("taunted", remember(MemoryId::ChiefTauntedYou, "challenge")),
        (
            "challenge",
            notify(NotificationId::ChiefChallenge, Some("threat")),
        ),
        ("threat", notify(NotificationId::ChiefThreat, None)),
    ],
};

const PELL_HOSTILE: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "defeated",
            Node::On {
                event: RiftEvent::Defeated,
                next: Some("fight_over"),
            },
        ),
        (
            "fight_over",
            Node::Effect(RiftEffect::Forget(Forget {
                who: None,
                memories: &[MemoryId::PellFighting],
                next: Some("dead"),
            })),
        ),
        (
            "dead",
            Node::Effect(RiftEffect::Remember(Remember {
                who: None,
                memory: MemoryId::PellDead,
                to: None,
                next: None,
            })),
        ),
    ],
};

const MARA: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        ("interacted", talk("mood")),
        (
            "mood",
            Node::If {
                test: SIDED_WITH_ORCS,
                yes: Some("cold"),
                no: Some("hello"),
            },
        ),
        (
            "hello",
            tell(
                &[
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Generic(Happy)),
                        text: &[plain(
                            "Welcome, traveller! Fresh crates off the boat this morning.",
                        )],
                    },
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Individual(ExpressionId::MaraSmug)),
                        text: &[plain(
                            "And if you've got a strong arm, I might have a job that pays.",
                        )],
                    },
                ],
                &[
                    choice(&[plain("What happened to the docks?")], Some("docks")),
                    choice(&[plain("Show me your wares.")], Some("wares")),
                    topic(
                        &[plain("Tusks for the Chief")],
                        Expr::Not(&TUSKS_DONE),
                        "tusks",
                    ),
                    choice(&[plain("Goodbye.")], None),
                ],
            ),
        ),
        (
            "docks",
            tell(
                &[
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Generic(Angry)),
                        text: &[
                            styled("Orcs", &[Fx::Ink(Ink::Danger)]),
                            plain(". They come down from the "),
                            styled("north shore", &[Fx::Ink(Ink::Place)]),
                            plain(" at night and take whatever isn't nailed down."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Individual(ExpressionId::MaraCounting)),
                        text: &[
                            plain("Do you know what a crate of silk costs? I do. "),
                            styled("To the copper.", &[Fx::Slow]),
                        ],
                    },
                ],
                &[choice(&[plain("Goodbye.")], None)],
            ),
        ),
        (
            "cold",
            tell(
                &[
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Generic(Angry)),
                        text: &[
                            plain("I heard where my tusks went. "),
                            styled("Back to the orcs.", &[Fx::Slow]),
                        ],
                    },
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Generic(Neutral)),
                        text: &[plain(
                            "Your coin still spends. Don't expect more than that.",
                        )],
                    },
                ],
                &[
                    choice(&[plain("Show me your wares.")], Some("wares")),
                    choice(&[plain("Goodbye.")], None),
                ],
            ),
        ),
        (
            "wares",
            tell_then(
                &[Line {
                    by: Npc(Id::Mara),
                    face: Some(Individual(ExpressionId::MaraCounting)),
                    text: &[
                        plain("Take your time. Everything's priced fair. "),
                        styled("Mostly.", &[Fx::Voice(Tone::Whisper)]),
                    ],
                }],
                "shop",
            ),
        ),
        (
            "shop",
            Node::Effect(RiftEffect::OpenShop(OpenShop {
                who: None,
                shop: ShopId::MaraWares,
                closed: None,
            })),
        ),
        (
            "tusks",
            Node::If {
                test: ON_TUSKS,
                yes: Some("tusks_turn_in"),
                no: Some("tusks_offer"),
            },
        ),
        (
            "tusks_offer",
            tell(
                &[
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Generic(Angry)),
                        text: &[
                            plain("Those "),
                            styled("orcs", &[Fx::Ink(Ink::Danger)]),
                            plain(
                                " have cost me three crates this week. I want it to cost them something.",
                            ),
                        ],
                    },
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Individual(ExpressionId::MaraCounting)),
                        text: &[
                            plain("Bring me five "),
                            styled("Orc Tusks", &[Fx::Ink(Ink::Item)]),
                            plain(". Put their "),
                            styled("chief", &[Fx::Ink(Ink::Danger)]),
                            plain(" in the sand and I'll make it worth your while."),
                        ],
                    },
                ],
                &[
                    Choice {
                        label: &[plain("Consider it done.")],
                        requires: Some(LEVEL_2),
                        reveal: &[Locked, Needs],
                        warn: None,
                        to: Some("tusks_accept"),
                    },
                    choice(&[plain("Not today.")], None),
                ],
            ),
        ),
        ("tusks_accept", accept(QuestId::TusksForTheChief)),
        (
            "tusks_turn_in",
            turn_in(QuestId::TusksForTheChief, "tusks_thanks", "tusks_not_yet"),
        ),
        (
            "tusks_thanks",
            tell(
                &[
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Generic(Surprised)),
                        text: &[plain("The chief too? You don't do things by halves.")],
                    },
                    Line {
                        by: Npc(Id::Mara),
                        face: Some(Generic(Happy)),
                        text: &[plain(
                            "Here's your purse, and take your pick of the good stock.",
                        )],
                    },
                ],
                &[choice(&[plain("Goodbye.")], None)],
            ),
        ),
        (
            "tusks_not_yet",
            tell(
                &[Line {
                    by: Npc(Id::Mara),
                    face: Some(Individual(ExpressionId::MaraSmug)),
                    text: &[plain(
                        "Five tusks and a dead chief. I don't pay for half a job.",
                    )],
                }],
                &[choice(&[plain("I'm on it.")], None)],
            ),
        ),
    ],
};

const TOBB_CATCH: Choice = choice(&[plain("Caught anything good today?")], Some("catch"));
const TOBB_LETTER: Choice = topic(
    &[plain("A Letter for the Captain")],
    Expr::Not(&LETTER_DONE),
    "letter",
);
const TOBB_LOW_TIDE: Choice = topic(&[plain("Low Tide")], Expr::Not(&LOW_TIDE_DONE), "low_tide");

const TOBB: InlineScript = InlineScript {
    state: &[],
    locals: &[("visits", ValueType::Integer)],
    nodes: &[
        (
            "interacted",
            Node::On {
                event: RiftEvent::Interacted {
                    verb: Verb::Talk,
                    reach: Tiles(2.0),
                    marks: &[],
                    news: true,
                },
                next: Some("just_visited"),
            },
        ),
        (
            "just_visited",
            Node::If {
                test: TOBB_VISITED_LATELY,
                yes: Some("again"),
                no: Some("count_visit"),
            },
        ),
        (
            "count_visit",
            Node::Set {
                values: &[Assignment {
                    target: Target::Local("visits"),
                    to: Expr::Add(&TOBB_VISITS, &ONE_MORE),
                }],
                next: Some("store_visit"),
            },
        ),
        (
            "store_visit",
            Node::Effect(RiftEffect::Remember(Remember {
                who: None,
                memory: MemoryId::TobbVisits,
                to: Some(&VISITS),
                next: Some("lure_due"),
            })),
        ),
        (
            "lure_due",
            Node::If {
                test: Expr::All(&[
                    Expr::AtLeast(&VISITS, &Expr::Int(6)),
                    Expr::Not(&TOBB_GAVE_LURE),
                ]),
                yes: Some("gift"),
                no: Some("old_friend"),
            },
        ),
        (
            "old_friend",
            Node::If {
                test: Expr::AtLeast(&VISITS, &Expr::Int(7)),
                yes: Some("gossip"),
                no: Some("familiar"),
            },
        ),
        (
            "familiar",
            Node::If {
                test: Expr::AtLeast(&VISITS, &Expr::Int(4)),
                yes: Some("regular"),
                no: Some("met_before"),
            },
        ),
        (
            "met_before",
            Node::If {
                test: Expr::AtLeast(&VISITS, &Expr::Int(2)),
                yes: Some("back"),
                no: Some("hello"),
            },
        ),
        (
            "hello",
            tell(
                &[
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Happy)),
                        text: &[plain(
                            "Ho there! Name's Tobb. Been fishing this harbour since I could hold a rod.",
                        )],
                    },
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Neutral)),
                        text: &[plain(
                            "If it swims, I've caught it. If it talks, I've heard it.",
                        )],
                    },
                ],
                &[
                    TOBB_CATCH,
                    TOBB_LETTER,
                    TOBB_LOW_TIDE,
                    choice(&[plain("See you around, Tobb.")], None),
                ],
            ),
        ),
        (
            "catch",
            tell(
                &[
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Thinking)),
                        text: &[plain("A boot, two crabs and a very rude gull.")],
                    },
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Individual(ExpressionId::TobbLaughing)),
                        text: &[plain("Best day all week!")],
                    },
                ],
                &[choice(&[plain("Good luck out there.")], None)],
            ),
        ),
        (
            "again",
            tell(
                &[Line {
                    by: Npc(Id::Tobb),
                    face: Some(Generic(Surprised)),
                    text: &[plain(
                        "Didn't I just see you? The fish won't catch themselves, you know.",
                    )],
                }],
                &[
                    TOBB_LETTER,
                    TOBB_LOW_TIDE,
                    choice(&[plain("Sorry, Tobb.")], None),
                ],
            ),
        ),
        (
            "back",
            tell(
                &[Line {
                    by: Npc(Id::Tobb),
                    face: Some(Generic(Happy)),
                    text: &[plain("Back again! Pull up a crate.")],
                }],
                &[
                    TOBB_CATCH,
                    TOBB_LETTER,
                    TOBB_LOW_TIDE,
                    choice(&[plain("See you around, Tobb.")], None),
                ],
            ),
        ),
        (
            "regular",
            tell(
                &[
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Happy)),
                        text: &[plain(
                            "You've got patience, I'll give you that. Most folk don't come back to hear about crabs.",
                        )],
                    },
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Thinking)),
                        text: &[plain("Keep it up and I might just have something for you.")],
                    },
                ],
                &[
                    TOBB_LETTER,
                    TOBB_LOW_TIDE,
                    choice(&[plain("I'll hold you to that.")], None),
                ],
            ),
        ),
        (
            "gift",
            tell(
                &[
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Happy)),
                        text: &[
                            plain("Here. My "),
                            styled("lucky lure", &[Fx::Ink(Ink::Item)]),
                            plain("."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Neutral)),
                        text: &[plain("Don't lose it. It's caught more fish than I have.")],
                    },
                ],
                &[
                    choice(&[plain("Thank you, Tobb.")], Some("give_lure")),
                    TOBB_LETTER,
                    TOBB_LOW_TIDE,
                    choice(&[plain("Maybe later.")], None),
                ],
            ),
        ),
        (
            "give_lure",
            gain(&[ItemStack::new(ItemId::LuckyLure, 1)], "remember_lure"),
        ),
        (
            "remember_lure",
            Node::Effect(RiftEffect::Remember(Remember {
                who: None,
                memory: MemoryId::TobbGaveLure,
                to: None,
                next: None,
            })),
        ),
        (
            "gossip",
            tell(
                &[
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Thinking)),
                        text: &[
                            styled("Pell", &[Fx::Ink(Ink::Name)]),
                            plain(" loads his dice, you know. "),
                            styled("Everyone says so.", &[Fx::Voice(Tone::Whisper)]),
                        ],
                    },
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Sad)),
                        text: &[plain("Nobody can prove it, mind.")],
                    },
                ],
                &[
                    TOBB_LETTER,
                    TOBB_LOW_TIDE,
                    choice(&[plain("I'll keep an eye on him.")], None),
                ],
            ),
        ),
        (
            "came_near",
            Node::On {
                event: RiftEvent::CameNear {
                    within: Tiles(3.0),
                    by: Who::Characters,
                    npc: None,
                },
                next: Some("news_due"),
            },
        ),
        (
            "news_due",
            Node::If {
                test: Expr::All(&[
                    Expr::AtLeast(&TOBB_VISITS, &Expr::Int(1)),
                    Expr::Not(&TOBB_NEWS_TODAY),
                ]),
                yes: Some("remember_news"),
                no: None,
            },
        ),
        ("remember_news", remember(MemoryId::TobbNewsToday, "news")),
        (
            "news",
            tell(
                &[
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Surprised)),
                        text: &[plain("Oi! Over here! You'll want to hear this.")],
                    },
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Thinking)),
                        text: &[
                            styled("Orcs", &[Fx::Ink(Ink::Danger)]),
                            plain(" were seen on the "),
                            styled("north shore", &[Fx::Ink(Ink::Place)]),
                            plain(" at dawn. Big ones, with a chief in a bone helmet."),
                        ],
                    },
                ],
                &[choice(
                    &[plain("Thanks for the warning. I'll keep my eyes open.")],
                    None,
                )],
            ),
        ),
        (
            "letter",
            Node::If {
                test: ON_LETTER,
                yes: Some("letter_waiting"),
                no: Some("letter_offer"),
            },
        ),
        (
            "letter_offer",
            tell(
                &[
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Thinking)),
                        text: &[
                            plain("Do me a kindness? This letter needs to reach "),
                            styled("Captain Bram", &[Fx::Ink(Ink::Name)]),
                            plain(" on the "),
                            styled("Gull", &[Fx::Ink(Ink::Name)]),
                            plain("."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Individual(ExpressionId::TobbLaughing)),
                        text: &[plain(
                            "My knees and that gangplank are not on speaking terms.",
                        )],
                    },
                ],
                &[
                    choice(&[plain("I'll take it.")], Some("letter_accept")),
                    choice(&[plain("Sorry, I'm busy.")], None),
                ],
            ),
        ),
        ("letter_accept", accept(QuestId::LetterForTheCaptain)),
        (
            "letter_waiting",
            tell(
                &[Line {
                    by: Npc(Id::Tobb),
                    face: Some(Generic(Neutral)),
                    text: &[plain(
                        "Bram's on his ship, at the end of the pier. Can't miss him. He's the one scowling.",
                    )],
                }],
                &[choice(&[plain("On my way.")], None)],
            ),
        ),
        (
            "low_tide",
            Node::If {
                test: ON_LOW_TIDE,
                yes: Some("low_tide_turn_in"),
                no: Some("low_tide_offer"),
            },
        ),
        (
            "low_tide_offer",
            tell(
                &[
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Surprised)),
                        text: &[
                            plain("Tide's turning and I've nothing in the basket! Three "),
                            styled("Fish Steaks", &[Fx::Ink(Ink::Item)]),
                            plain(", quick."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Tobb),
                        face: Some(Generic(Happy)),
                        text: &[
                            plain("Before the water's out, mind. "),
                            styled("Ten minutes.", &[Fx::Ink(Ink::Danger)]),
                        ],
                    },
                ],
                &[
                    choice(&[plain("I'll hurry.")], Some("low_tide_accept")),
                    choice(&[plain("Can't right now.")], None),
                ],
            ),
        ),
        ("low_tide_accept", accept(QuestId::LowTide)),
        (
            "low_tide_turn_in",
            turn_in(QuestId::LowTide, "low_tide_thanks", "low_tide_waiting"),
        ),
        (
            "low_tide_waiting",
            tell(
                &[Line {
                    by: Npc(Id::Tobb),
                    face: Some(Generic(Sad)),
                    text: &[plain(
                        "The gulls are circling. Three steaks, quick as you can!",
                    )],
                }],
                &[choice(&[plain("Working on it.")], None)],
            ),
        ),
        (
            "low_tide_thanks",
            tell(
                &[Line {
                    by: Npc(Id::Tobb),
                    face: Some(Individual(ExpressionId::TobbLaughing)),
                    text: &[plain(
                        "Just in time! Take some bait. You'll have the gulls following you for a week.",
                    )],
                }],
                &[choice(&[plain("Thanks, Tobb.")], None)],
            ),
        ),
    ],
};

const GRISHA_CHOICES: &[Choice] = &[
    Choice {
        label: &[plain("Rest until I'm mended.")],
        requires: Some(Expr::Not(&INN_REGULAR)),
        reveal: &[Costs],
        warn: None,
        to: Some("pay_bed"),
    },
    Choice {
        label: &[plain("Rest until I'm mended.")],
        requires: Some(INN_REGULAR),
        reveal: &[Costs],
        warn: None,
        to: Some("pay_regular_bed"),
    },
    Choice {
        label: &[plain("Buy a round for the room.")],
        requires: None,
        reveal: &[Costs],
        warn: None,
        to: Some("pay_round"),
    },
    choice(&[plain("Chat.")], Some("chat")),
    choice(&[plain("Goodbye.")], None),
];

const GRISHA_CHAT_DONE: &[Choice] = &[choice(&[plain("Ok.")], Some("chat"))];

const GRISHA: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "interacted",
            Node::On {
                event: RiftEvent::Interacted {
                    verb: Verb::Talk,
                    reach: Tiles(2.0),
                    marks: &[AttentionId::Innkeeper],
                    news: false,
                },
                next: Some("favoured"),
            },
        ),
        (
            "favoured",
            Node::If {
                test: INN_REGULAR,
                yes: Some("regular"),
                no: Some("hello"),
            },
        ),
        (
            "hello",
            tell(
                &[Line {
                    by: Npc(Id::Grisha),
                    face: Some(Generic(Happy)),
                    text: &[
                        plain("Welcome to the "),
                        styled("Driftwood Inn", &[Fx::Ink(Ink::Place)]),
                        plain("! A bed, a bowl, and all the gossip you can stomach."),
                    ],
                }],
                GRISHA_CHOICES,
            ),
        ),
        (
            "regular",
            tell(
                &[Line {
                    by: Npc(Id::Grisha),
                    face: Some(Generic(Happy)),
                    text: &[
                        plain("My favourite guest! Rest your bones. For you, three "),
                        styled("Gold", &[Fx::Ink(Ink::Item)]),
                        plain("."),
                    ],
                }],
                GRISHA_CHOICES,
            ),
        ),
        ("pay_bed", pay(&[ItemStack::new(ItemId::Gold, 5)], "heal")),
        (
            "pay_regular_bed",
            pay(&[ItemStack::new(ItemId::Gold, 3)], "heal"),
        ),
        (
            "heal",
            Node::Effect(RiftEffect::Heal(Heal {
                who: None,
                by: HealBy::Full,
                next: Some("rested"),
            })),
        ),
        (
            "rested",
            tell(
                &[Line {
                    by: Npc(Id::Grisha),
                    face: Some(Generic(Neutral)),
                    text: &[plain("There. Slept like a log, you did.")],
                }],
                &[choice(&[plain("Good as new. Thanks, Grisha.")], None)],
            ),
        ),
        (
            "pay_round",
            pay(&[ItemStack::new(ItemId::Gold, 10)], "round_counted"),
        ),
        (
            "round_counted",
            Node::If {
                test: INN_FAVOUR_LATELY,
                yes: Some("round"),
                no: Some("count_round"),
            },
        ),
        (
            "count_round",
            Node::Effect(RiftEffect::Remember(Remember {
                who: None,
                memory: MemoryId::InnFavour,
                to: Some(&Expr::Add(&INN_FAVOUR, &ONE_MORE)),
                next: Some("round"),
            })),
        ),
        (
            "round",
            tell(
                &[
                    Line {
                        by: Narrator,
                        face: None,
                        text: &[plain(
                            "The room cheers. Someone starts a song about a mermaid and a very confused sailor.",
                        )],
                    },
                    Line {
                        by: Npc(Id::Grisha),
                        face: Some(Generic(Happy)),
                        text: &[plain("Keep that up and you'll be a regular in no time.")],
                    },
                ],
                GRISHA_CHOICES,
            ),
        ),
        (
            "anything_else",
            tell(
                &[Line {
                    by: Npc(Id::Grisha),
                    face: Some(Generic(Neutral)),
                    text: &[plain("Suit yourself. Anything else?")],
                }],
                GRISHA_CHOICES,
            ),
        ),
        (
            "chat",
            tell(
                &[Line {
                    by: Npc(Id::Grisha),
                    face: Some(Generic(Happy)),
                    text: &[plain("Ask away. Gossip's free, the ale isn't.")],
                }],
                &[
                    choice(&[plain("Tell me about this island.")], Some("island")),
                    topic(
                        &[plain("Any rumours?")],
                        Expr::All(&[Expr::Not(&INN_PATRON), Expr::Not(&ON_TUSKS)]),
                        "rumour_wren",
                    ),
                    topic(
                        &[plain("Any rumours?")],
                        Expr::All(&[INN_PATRON, Expr::Not(&ON_TUSKS)]),
                        "rumour_bram",
                    ),
                    topic(&[plain("Any rumours?")], ON_TUSKS, "rumour_chief"),
                    choice(&[plain("Never mind.")], Some("anything_else")),
                ],
            ),
        ),
        (
            "island",
            tell(
                &[
                    Line {
                        by: Narrator,
                        face: None,
                        text: &[plain("Grisha polishes a mug that will never be clean.")],
                    },
                    Line {
                        by: Npc(Id::Grisha),
                        face: Some(Generic(Neutral)),
                        text: &[
                            plain("This rock? Fishers, a market, my "),
                            styled("inn", &[Fx::Ink(Ink::Place)]),
                            plain(", and "),
                            styled("Bram", &[Fx::Ink(Ink::Name)]),
                            plain("'s ferry to the "),
                            styled("forest shore", &[Fx::Ink(Ink::Place)]),
                            plain("."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Grisha),
                        face: Some(Generic(Thinking)),
                        text: &[
                            plain("Past the town it's sand and "),
                            styled("skeletons", &[Fx::Ink(Ink::Danger)]),
                            plain(", and "),
                            styled("orcs", &[Fx::Ink(Ink::Danger)]),
                            plain(" up the "),
                            styled("north shore", &[Fx::Ink(Ink::Place)]),
                            plain(". "),
                            styled("Ilsa", &[Fx::Ink(Ink::Name)]),
                            plain(" minds the "),
                            styled("forest road", &[Fx::Ink(Ink::Place)]),
                            plain("."),
                        ],
                    },
                ],
                GRISHA_CHAT_DONE,
            ),
        ),
        (
            "rumour_wren",
            tell(
                &[Line {
                    by: Npc(Id::Grisha),
                    face: Some(Generic(Thinking)),
                    text: &[
                        styled("Wren", &[Fx::Ink(Ink::Name)]),
                        plain(" pays good tokens for bones. Don't ask what she does with them."),
                    ],
                }],
                &[
                    choice(&[plain("What does she do with them?")], Some("wren_secret")),
                    choice(&[plain("Ok.")], Some("chat")),
                ],
            ),
        ),
        (
            "wren_secret",
            tell(
                &[
                    Line {
                        by: Npc(Id::Grisha),
                        face: Some(Generic(Angry)),
                        text: &[
                            plain("What did I "),
                            styled("just", &[Fx::Voice(Tone::Shout)]),
                            plain(" say?"),
                        ],
                    },
                    Line {
                        by: Narrator,
                        face: None,
                        text: &[plain("She leans over the bar anyway.")],
                    },
                    Line {
                        by: Npc(Id::Grisha),
                        face: Some(Generic(Thinking)),
                        text: &[styled(
                            "Soup, or charms. Depends who's asking, and who's buying.",
                            &[Fx::Voice(Tone::Whisper)],
                        )],
                    },
                ],
                GRISHA_CHAT_DONE,
            ),
        ),
        (
            "rumour_bram",
            tell(
                &[Line {
                    by: Npc(Id::Grisha),
                    face: Some(Generic(Sad)),
                    text: &[
                        plain("Between you and me? "),
                        styled("Bram", &[Fx::Ink(Ink::Name)]),
                        plain(
                            "'s ferry hasn't left since the orcs came. He's waiting on a brave fool.",
                        ),
                    ],
                }],
                GRISHA_CHAT_DONE,
            ),
        ),
        (
            "rumour_chief",
            tell(
                &[
                    Line {
                        by: Npc(Id::Grisha),
                        face: Some(Generic(Thinking)),
                        text: &[
                            plain("The orc "),
                            styled("chief", &[Fx::Ink(Ink::Danger)]),
                            plain("? Camps on the "),
                            styled("north shore", &[Fx::Ink(Ink::Place)]),
                            plain(" with his guard around him."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Grisha),
                        face: Some(Generic(Neutral)),
                        text: &[
                            plain("There's a shaman with that clan, out in the "),
                            styled("Forest", &[Fx::Ink(Ink::Place)]),
                            plain(". "),
                            styled(
                                "They say she's not keen on the fighting.",
                                &[Fx::Voice(Tone::Whisper)],
                            ),
                        ],
                    },
                ],
                GRISHA_CHAT_DONE,
            ),
        ),
    ],
};

const BRAM: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "interacted",
            Node::On {
                event: RiftEvent::Interacted {
                    verb: Verb::Talk,
                    reach: Tiles(2.0),
                    marks: &[AttentionId::Travel],
                    news: false,
                },
                next: Some("hello"),
            },
        ),
        (
            "hello",
            tell(
                &[
                    Line {
                        by: Npc(Id::Bram),
                        face: Some(Generic(Neutral)),
                        text: &[
                            plain("Captain Bram, of the "),
                            styled("Gull", &[Fx::Ink(Ink::Name)]),
                            plain("."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Bram),
                        face: Some(Generic(Thinking)),
                        text: &[
                            plain("She sails for the "),
                            styled("forest shore", &[Fx::Ink(Ink::Place)]),
                            plain(" at the bell. Twenty "),
                            styled("Gold", &[Fx::Ink(Ink::Item)]),
                            plain(", or show me a pass."),
                        ],
                    },
                ],
                &[
                    Choice {
                        label: &[plain("Sail to the forest.")],
                        requires: None,
                        reveal: &[Costs],
                        warn: None,
                        to: Some("fare"),
                    },
                    Choice {
                        label: &[plain("Ilsa gave me this pass.")],
                        requires: Some(HOLDS_ROAD_PASS),
                        reveal: &[Needs],
                        warn: None,
                        to: Some("sail"),
                    },
                    topic(
                        &[plain("A Letter for the Captain")],
                        ON_LETTER,
                        "letter_turn_in",
                    ),
                    topic(
                        &[plain("Bats in the Belfry")],
                        Expr::All(&[Expr::Not(&BATS_DONE), Expr::Any(&[ON_BATS, BATS_OPEN])]),
                        "bats",
                    ),
                    choice(&[plain("Goodbye.")], None),
                ],
            ),
        ),
        ("fare", pay(&[ItemStack::new(ItemId::Gold, 20)], "sail")),
        ("sail", notify(NotificationId::GullSails, Some("cross"))),
        (
            "cross",
            Node::Effect(RiftEffect::Warp(Warp {
                who: None,
                to: Fill::Const(Place {
                    area: AreaId::Forest,
                    at: Pos::new(22.0, 17.0),
                }),
                next: None,
            })),
        ),
        (
            "letter_turn_in",
            Node::Effect(RiftEffect::TurnIn(TurnIn {
                who: None,
                quest: QuestId::LetterForTheCaptain,
                done: Some("letter_thanks"),
                refused: None,
                cancelled: None,
            })),
        ),
        (
            "letter_thanks",
            tell(
                &[Line {
                    by: Npc(Id::Bram),
                    face: Some(Generic(Surprised)),
                    text: &[
                        plain("A letter? From "),
                        styled("Tobb", &[Fx::Ink(Ink::Name)]),
                        plain("? He's never written a word in his life."),
                    ],
                }],
                &[choice(&[plain("Never mind.")], None)],
            ),
        ),
        (
            "bats",
            Node::If {
                test: ON_BATS,
                yes: Some("bats_turn_in"),
                no: Some("bats_offer"),
            },
        ),
        (
            "bats_offer",
            tell(
                &[
                    Line {
                        by: Npc(Id::Bram),
                        face: Some(Generic(Angry)),
                        text: &[
                            styled("Vampire bats", &[Fx::Ink(Ink::Danger)]),
                            plain(
                                " have taken the old belfry, and one of the devils made off with my ",
                            ),
                            styled("key", &[Fx::Ink(Ink::Item)]),
                            plain("."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Bram),
                        face: Some(Generic(Neutral)),
                        text: &[plain(
                            "Thin them out and bring the key back. Tobb vouches for you, so I'll pay.",
                        )],
                    },
                ],
                &[
                    choice(&[plain("I'll deal with them.")], Some("bats_accept")),
                    choice(&[plain("Not now.")], None),
                ],
            ),
        ),
        ("bats_accept", accept(QuestId::BatsInTheBelfry)),
        (
            "bats_turn_in",
            turn_in(QuestId::BatsInTheBelfry, "bats_thanks", "bats_waiting"),
        ),
        (
            "bats_waiting",
            tell(
                &[Line {
                    by: Npc(Id::Bram),
                    face: Some(Generic(Thinking)),
                    text: &[plain(
                        "Still squeaking up there. Keep at it, and keep an eye out for that key.",
                    )],
                }],
                &[choice(&[plain("Understood.")], None)],
            ),
        ),
        (
            "bats_thanks",
            tell(
                &[Line {
                    by: Npc(Id::Bram),
                    face: Some(Generic(Happy)),
                    text: &[plain(
                        "Quiet up there at last, and my key besides. You've earned this.",
                    )],
                }],
                &[choice(&[plain("Goodbye.")], None)],
            ),
        ),
    ],
};

const WREN: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        ("interacted", talk("hello")),
        (
            "hello",
            tell(
                &[
                    Line {
                        by: Npc(Id::Wren),
                        face: Some(Individual(ExpressionId::WrenSleepy)),
                        text: &[plain("Bones. Wings. Nothing else.")],
                    },
                    Line {
                        by: Npc(Id::Wren),
                        face: Some(Generic(Thinking)),
                        text: &[plain("If you find any, you know where I am.")],
                    },
                ],
                &[
                    topic(
                        &[plain("When can I bring more bones?")],
                        TITHE_COOLING,
                        "tomorrow",
                    ),
                    choice(&[plain("I've brought bones.")], Some("counter")),
                    topic(&[plain("Bone Tithe")], Expr::Not(&TITHE_COOLING), "tithe"),
                    choice(&[plain("Goodbye.")], None),
                ],
            ),
        ),
        (
            "tomorrow",
            tell(
                &[
                    Line {
                        by: Npc(Id::Wren),
                        face: Some(Individual(ExpressionId::WrenSleepy)),
                        text: &[
                            plain("The dead are down for today. Come back in "),
                            value(&TITHE_RESETS_IN),
                            plain("."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Wren),
                        face: Some(Generic(Thinking)),
                        text: &[
                            plain("Ten "),
                            styled("Bones", &[Fx::Ink(Ink::Item)]),
                            plain(". Not nine."),
                        ],
                    },
                ],
                &[choice(&[plain("I'll be back.")], None)],
            ),
        ),
        (
            "counter",
            tell_then(
                &[Line {
                    by: Npc(Id::Wren),
                    face: Some(Individual(ExpressionId::WrenSleepy)),
                    text: &[plain("On the counter. I'll count.")],
                }],
                "shop",
            ),
        ),
        (
            "shop",
            Node::Effect(RiftEffect::OpenShop(OpenShop {
                who: None,
                shop: ShopId::BoneExchange,
                closed: None,
            })),
        ),
        (
            "tithe",
            Node::If {
                test: ON_TITHE,
                yes: Some("tithe_turn_in"),
                no: Some("tithe_offer"),
            },
        ),
        (
            "tithe_offer",
            tell(
                &[
                    Line {
                        by: Npc(Id::Wren),
                        face: Some(Individual(ExpressionId::WrenSleepy)),
                        text: &[
                            plain("Ten "),
                            styled("Bones", &[Fx::Ink(Ink::Item)]),
                            plain(" a day keeps the dead from wandering."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Wren),
                        face: Some(Generic(Neutral)),
                        text: &[
                            plain("Bring them, and I pay in "),
                            styled("tokens", &[Fx::Ink(Ink::Item)]),
                            plain(". Every day."),
                        ],
                    },
                ],
                &[
                    choice(&[plain("I'll bring today's bones.")], Some("tithe_accept")),
                    choice(&[plain("Maybe tomorrow.")], None),
                ],
            ),
        ),
        ("tithe_accept", accept(QuestId::BoneTithe)),
        (
            "tithe_turn_in",
            turn_in(QuestId::BoneTithe, "tithe_thanks", "tithe_waiting"),
        ),
        (
            "tithe_waiting",
            tell(
                &[Line {
                    by: Npc(Id::Wren),
                    face: Some(Generic(Thinking)),
                    text: &[plain("Ten. Not nine.")],
                }],
                &[choice(&[plain("Right.")], None)],
            ),
        ),
        (
            "tithe_thanks",
            tell(
                &[Line {
                    by: Npc(Id::Wren),
                    face: Some(Generic(Happy)),
                    text: &[plain("Good. The dead stay down another night.")],
                }],
                &[choice(&[plain("Goodbye.")], None)],
            ),
        ),
    ],
};

const PELL: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "interacted",
            Node::On {
                event: RiftEvent::Interacted {
                    verb: Verb::Talk,
                    reach: Tiles(2.0),
                    marks: &[AttentionId::Chance],
                    news: false,
                },
                next: Some("holds_grudge"),
            },
        ),
        (
            "holds_grudge",
            Node::If {
                test: PELL_GRUDGE_LATELY,
                yes: Some("grudging"),
                no: Some("hello"),
            },
        ),
        (
            "hello",
            tell(
                &[Line {
                    by: Npc(Id::Pell),
                    face: Some(Individual(ExpressionId::PellSmirk)),
                    text: &[
                        plain("Care for a "),
                        styled("little game", &[Fx::Motion(Motion::Wave)]),
                        plain("? Ten "),
                        styled("Gold", &[Fx::Ink(Ink::Item)]),
                        styled(".", &[Fx::PauseAfter(Millis(600.0))]),
                        styled(" I never cheat.", &[Fx::Voice(Tone::Whisper)]),
                    ],
                }],
                &[
                    Choice {
                        label: &[plain("Roll the dice.")],
                        requires: None,
                        reveal: &[Costs],
                        warn: None,
                        to: Some("stake"),
                    },
                    choice(&[plain("Not today.")], None),
                ],
            ),
        ),
        ("stake", pay(&[ItemStack::new(ItemId::Gold, 10)], "roll")),
        (
            "roll",
            Node::Random {
                weights: &[45, 55],
                outputs: &[Some("payout"), Some("wins")],
            },
        ),
        ("payout", gain(&[ItemStack::new(ItemId::Gold, 20)], "loses")),
        (
            "wins",
            tell(
                &[Line {
                    by: Npc(Id::Pell),
                    face: Some(Generic(Happy)),
                    text: &[
                        plain("The house wins! The dice are "),
                        styled("fickle friends", &[Fx::Motion(Motion::Wave)]),
                        plain(", eh?"),
                    ],
                }],
                &[
                    Choice {
                        label: &[plain("Roll again.")],
                        requires: None,
                        reveal: &[Costs],
                        warn: None,
                        to: Some("stake"),
                    },
                    choice(&[plain("You're cheating.")], Some("remember_grudge")),
                    choice(&[plain("Leave.")], None),
                ],
            ),
        ),
        (
            "loses",
            tell(
                &[Line {
                    by: Npc(Id::Pell),
                    face: Some(Generic(Surprised)),
                    text: &[
                        plain("Bah! Beginner's luck. Twenty "),
                        styled("Gold", &[Fx::Ink(Ink::Item)]),
                        plain(", as promised."),
                    ],
                }],
                &[
                    Choice {
                        label: &[plain("Roll again.")],
                        requires: None,
                        reveal: &[Costs],
                        warn: None,
                        to: Some("stake"),
                    },
                    choice(&[plain("I'll quit while I'm ahead.")], None),
                ],
            ),
        ),
        (
            "remember_grudge",
            remember(MemoryId::PellGrudge, "call_guards"),
        ),
        (
            "call_guards",
            notify(NotificationId::PellCallsGuards, Some("guards")),
        ),
        (
            "guards",
            Node::Effect(RiftEffect::SpawnNpcs(SpawnNpcs {
                npc: Id::HarbourGuard,
                count: 2,
                near: SpawnNear::Owner,
                shown: ShownFor::Subject,
                next: None,
            })),
        ),
        (
            "grudging",
            tell(
                &[Line {
                    by: Npc(Id::Pell),
                    face: Some(Generic(Angry)),
                    text: &[
                        plain("You've got "),
                        styled("some nerve", &[Fx::Voice(Tone::Shout)]),
                        plain(", showing your face at my table."),
                    ],
                }],
                &[
                    choice(&[plain("Then let's settle this.")], Some("remember_fight")),
                    choice(&[plain("I'm leaving.")], None),
                ],
            ),
        ),
        (
            "remember_fight",
            remember(MemoryId::PellFighting, "draw_knife"),
        ),
        (
            "draw_knife",
            notify(NotificationId::PellDrawsKnife, Some("hostile_pell")),
        ),
        (
            "hostile_pell",
            Node::Effect(RiftEffect::SpawnNpcs(SpawnNpcs {
                npc: Id::PellHostile,
                count: 1,
                near: SpawnNear::Owner,
                shown: ShownFor::Subject,
                next: None,
            })),
        ),
    ],
};

const ILSA: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "came_near",
            Node::On {
                event: RiftEvent::CameNear {
                    within: Tiles(3.5),
                    by: Who::Characters,
                    npc: None,
                },
                next: Some("no_pass"),
            },
        ),
        (
            "no_pass",
            Node::If {
                test: Expr::Not(&HOLDS_ROAD_PASS),
                yes: Some("halt"),
                no: None,
            },
        ),
        (
            "halt",
            Node::Effect(RiftEffect::Say(Say {
                text: &[
                    styled(
                        "Halt!",
                        &[Fx::Voice(Tone::Shout), Fx::Motion(Motion::Shake)],
                    ),
                    plain(" Nobody takes the "),
                    styled("forest road", &[Fx::Ink(Ink::Place)]),
                    plain(" without a pass."),
                ],
                within: None,
                next: None,
            })),
        ),
        ("interacted", talk("has_pass")),
        (
            "has_pass",
            Node::If {
                test: HOLDS_ROAD_PASS,
                yes: Some("pass_holder"),
                no: Some("hello"),
            },
        ),
        (
            "pass_holder",
            tell(
                &[Line {
                    by: Npc(Id::Ilsa),
                    face: Some(Generic(Neutral)),
                    text: &[
                        plain("You've got your "),
                        styled("pass", &[Fx::Ink(Ink::Item)]),
                        plain(". The road's yours."),
                    ],
                }],
                &[choice(&[plain("Goodbye.")], None)],
            ),
        ),
        (
            "hello",
            tell(
                &[
                    Line {
                        by: Npc(Id::Ilsa),
                        face: Some(Generic(Angry)),
                        text: &[
                            plain("The forest road is "),
                            styled("closed", &[Fx::Ink(Ink::Danger)]),
                            plain(". Orders from the harbour master."),
                        ],
                    },
                    Line {
                        by: Npc(Id::Ilsa),
                        face: Some(Generic(Thinking)),
                        text: &[plain(
                            "Seasoned fighters excepted. Everyone else turns back.",
                        )],
                    },
                ],
                &[
                    Choice {
                        label: &[plain("I'm ready for the forest road.")],
                        requires: Some(LEVEL_3),
                        reveal: &[Locked, Needs],
                        warn: None,
                        to: Some("earn_pass"),
                    },
                    topic(
                        &[plain("The Orc Chief won't trouble anyone now.")],
                        WEARS_TRIBAL_HELMET,
                        "earn_pass",
                    ),
                    Choice {
                        label: &[plain("Here, for your trouble.")],
                        requires: None,
                        reveal: &[Costs],
                        warn: None,
                        to: Some("buy_pass"),
                    },
                    Choice {
                        label: &[plain("Would a fish change your mind?")],
                        requires: None,
                        reveal: &[Costs],
                        warn: None,
                        to: Some("fish_for_pass"),
                    },
                    topic(
                        &[plain("Ugra's clan walks with me.")],
                        SIDED_WITH_ORCS,
                        "clan_pass",
                    ),
                    choice(&[plain("Never mind.")], None),
                ],
            ),
        ),
        ("earn_pass", gain(ROAD_PASS, "lets_you_pass")),
        (
            "buy_pass",
            Node::Effect(RiftEffect::Items(Items {
                who: None,
                take: &[ItemStack::new(ItemId::Gold, 20)],
                give: ROAD_PASS,
                done: Some("remember_bribe"),
                refused: None,
            })),
        ),
        ("remember_bribe", remember(MemoryId::BribedIlsa, "bribed")),
        (
            "fish_for_pass",
            Node::Effect(RiftEffect::Items(Items {
                who: None,
                take: &[ItemStack::new(ItemId::FishSteak, 1)],
                give: ROAD_PASS,
                done: Some("fish"),
                refused: None,
            })),
        ),
        ("clan_pass", gain(ROAD_PASS, "uneasy")),
        (
            "lets_you_pass",
            tell(
                &[Line {
                    by: Npc(Id::Ilsa),
                    face: Some(Generic(Neutral)),
                    text: &[
                        plain("Fine. Keep that "),
                        styled("pass", &[Fx::Ink(Ink::Item)]),
                        plain(" on you, and show it to "),
                        styled("Bram", &[Fx::Ink(Ink::Name)]),
                        plain(" if you're bound for the shore."),
                    ],
                }],
                &[choice(&[plain("Thank you.")], None)],
            ),
        ),
        (
            "bribed",
            tell(
                &[Line {
                    by: Npc(Id::Ilsa),
                    face: Some(Generic(Happy)),
                    text: &[
                        plain("Pleasure doing business. Here's your "),
                        styled("pass", &[Fx::Ink(Ink::Item)]),
                        plain(". "),
                        styled("I never saw a coin.", &[Fx::Voice(Tone::Whisper)]),
                    ],
                }],
                &[choice(&[plain("Goodbye.")], None)],
            ),
        ),
        (
            "fish",
            tell(
                &[Line {
                    by: Npc(Id::Ilsa),
                    face: Some(Generic(Surprised)),
                    text: &[
                        plain("Is that "),
                        styled("smoked", &[Fx::Slow]),
                        plain("? Fine. Take the "),
                        styled("pass", &[Fx::Ink(Ink::Item)]),
                        plain(", and not a word to the harbour master."),
                    ],
                }],
                &[choice(&[plain("Enjoy it.")], None)],
            ),
        ),
        (
            "uneasy",
            tell(
                &[Line {
                    by: Npc(Id::Ilsa),
                    face: Some(Generic(Thinking)),
                    text: &[
                        plain("The "),
                        styled("orcs", &[Fx::Ink(Ink::Danger)]),
                        plain(
                            " let you walk through their camp? Then they won't touch you on the road. Take the ",
                        ),
                        styled("pass", &[Fx::Ink(Ink::Item)]),
                        plain(", and go."),
                    ],
                }],
                &[choice(&[plain("Thank you.")], None)],
            ),
        ),
    ],
};

const UGRA: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        ("interacted", talk("turned_away")),
        (
            "turned_away",
            Node::If {
                test: SPURNED_UGRA,
                yes: Some("silent"),
                no: Some("befriended"),
            },
        ),
        (
            "befriended",
            Node::If {
                test: SIDED_WITH_ORCS,
                yes: Some("friend"),
                no: Some("hello"),
            },
        ),
        (
            "silent",
            tell(
                &[Line {
                    by: Narrator,
                    face: None,
                    text: &[plain(
                        "Ugra keeps her eyes on the fire. She has nothing to say to you.",
                    )],
                }],
                &[choice(&[plain("Leave.")], None)],
            ),
        ),
        (
            "hello",
            tell(
                &[
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Neutral)),
                        text: &[plain(
                            "You walk loud, outlander. The forest hears you long before I do.",
                        )],
                    },
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Thinking)),
                        text: &[plain("Speak, if you came to speak.")],
                    },
                ],
                &[
                    topic(
                        &[plain("The Shaman's Plea")],
                        Expr::All(&[ON_TUSKS, Expr::Not(&PLEA_DONE)]),
                        "plea",
                    ),
                    choice(&[plain("I'll leave you be.")], None),
                ],
            ),
        ),
        (
            "friend",
            tell(
                &[Line {
                    by: Npc(Id::Ugra),
                    face: Some(Generic(Happy)),
                    text: &[plain("Friend of the clan. The fire is yours to sit by.")],
                }],
                &[
                    choice(&[plain("Show me the clan's remedies.")], Some("remedies")),
                    topic(
                        &[plain("Rest for the Fallen")],
                        Expr::Not(&FALLEN_DONE),
                        "fallen",
                    ),
                    choice(&[plain("Farewell, Ugra.")], None),
                ],
            ),
        ),
        (
            "remedies",
            tell_then(
                &[Line {
                    by: Npc(Id::Ugra),
                    face: Some(Generic(Neutral)),
                    text: &[plain(
                        "Roots and bitter water. They mend what the forest breaks.",
                    )],
                }],
                "shop",
            ),
        ),
        (
            "shop",
            Node::Effect(RiftEffect::OpenShop(OpenShop {
                who: None,
                shop: ShopId::UgraRemedies,
                closed: None,
            })),
        ),
        (
            "plea",
            Node::If {
                test: ON_PLEA,
                yes: Some("plea_answer"),
                no: Some("plea_offer"),
            },
        ),
        (
            "plea_offer",
            tell(
                &[
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Angry)),
                        text: &[plain(
                            "You hunt for the trader woman. I smell her coin on you.",
                        )],
                    },
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Sad)),
                        text: &[
                            plain("Those tusks were cut from "),
                            styled("our dead", &[Fx::Slow]),
                            plain(". Hear me before you sell them."),
                        ],
                    },
                ],
                &[
                    choice(&[plain("I'm listening.")], Some("plea_accept")),
                    choice(&[plain("Not now.")], None),
                ],
            ),
        ),
        (
            "plea_accept",
            Node::Effect(RiftEffect::AcceptQuest(AcceptQuest {
                who: None,
                quest: QuestId::ShamansPlea,
                done: Some("plea_answer"),
                refused: None,
            })),
        ),
        (
            "plea_answer",
            tell(
                &[
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Neutral)),
                        text: &[plain(
                            "Give me the tusks of my kin, and the clan will call you friend.",
                        )],
                    },
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Angry)),
                        text: &[
                            plain("Keep them, and you are "),
                            styled("nothing", &[Fx::Ink(Ink::Danger)]),
                            plain(" to us."),
                        ],
                    },
                ],
                &[
                    Choice {
                        label: &[plain("Give her the tusks.")],
                        requires: Some(ON_TUSKS),
                        reveal: &[Locked, Needs, Costs],
                        warn: Some("Permanent · Tusks for the Chief fails"),
                        to: Some("give_tusks"),
                    },
                    Choice {
                        label: &[plain("Keep them.")],
                        requires: None,
                        reveal: &[],
                        warn: Some("Permanent · Ugra will never speak to you again"),
                        to: Some("keep_tusks"),
                    },
                    choice(&[plain("Let me think on it.")], None),
                ],
            ),
        ),
        (
            "give_tusks",
            pay(&[ItemStack::new(ItemId::OrcTusk, 5)], "side_with_clan"),
        ),
        (
            "side_with_clan",
            Node::Effect(RiftEffect::Decide(Decide {
                who: None,
                quest: QuestId::ShamansPlea,
                path: "Give the tusks",
                next: Some("plea_given"),
            })),
        ),
        (
            "plea_given",
            Node::Effect(RiftEffect::TurnIn(TurnIn {
                who: None,
                quest: QuestId::ShamansPlea,
                done: Some("fail_tusks"),
                refused: None,
                cancelled: None,
            })),
        ),
        (
            "fail_tusks",
            Node::Effect(RiftEffect::FailQuest(FailQuest {
                who: None,
                quest: QuestId::TusksForTheChief,
                next: Some("remember_sided"),
            })),
        ),
        (
            "remember_sided",
            remember(MemoryId::SidedWithOrcs, "grateful"),
        ),
        (
            "grateful",
            tell(
                &[
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Surprised)),
                        text: &[plain("You... truly?")],
                    },
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Happy)),
                        text: &[plain(
                            "Then the clan owes you. Come back when you need remedies, or work.",
                        )],
                    },
                ],
                &[choice(&[plain("Rest easy, Ugra.")], None)],
            ),
        ),
        (
            "keep_tusks",
            Node::Effect(RiftEffect::Decide(Decide {
                who: None,
                quest: QuestId::ShamansPlea,
                path: "Keep them",
                next: Some("plea_kept"),
            })),
        ),
        (
            "plea_kept",
            Node::Effect(RiftEffect::TurnIn(TurnIn {
                who: None,
                quest: QuestId::ShamansPlea,
                done: Some("remember_spurned"),
                refused: None,
                cancelled: None,
            })),
        ),
        (
            "remember_spurned",
            remember(MemoryId::SpurnedUgra, "spurned"),
        ),
        (
            "spurned",
            tell(
                &[Line {
                    by: Npc(Id::Ugra),
                    face: Some(Generic(Angry)),
                    text: &[
                        plain("Then go. "),
                        styled("And do not come back.", &[Fx::Voice(Tone::Shout)]),
                    ],
                }],
                &[choice(&[plain("Leave.")], None)],
            ),
        ),
        (
            "fallen",
            Node::If {
                test: ON_FALLEN,
                yes: Some("fallen_turn_in"),
                no: Some("fallen_offer"),
            },
        ),
        (
            "fallen_offer",
            tell(
                &[
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Sad)),
                        text: &[
                            plain("The "),
                            styled("skeletons", &[Fx::Ink(Ink::Danger)]),
                            plain(
                                " by the shore were warriors once. They walk because no one sang for them.",
                            ),
                        ],
                    },
                    Line {
                        by: Npc(Id::Ugra),
                        face: Some(Generic(Neutral)),
                        text: &[
                            plain("Bring me eight of their "),
                            styled("Bones", &[Fx::Ink(Ink::Item)]),
                            plain(", and I will."),
                        ],
                    },
                ],
                &[
                    choice(&[plain("I'll bring them.")], Some("fallen_accept")),
                    choice(&[plain("Another time.")], None),
                ],
            ),
        ),
        ("fallen_accept", accept(QuestId::RestForTheFallen)),
        (
            "fallen_turn_in",
            turn_in(QuestId::RestForTheFallen, "fallen_thanks", "fallen_waiting"),
        ),
        (
            "fallen_waiting",
            tell(
                &[Line {
                    by: Npc(Id::Ugra),
                    face: Some(Generic(Thinking)),
                    text: &[plain("Eight bones. The song needs all of them.")],
                }],
                &[choice(&[plain("I'm gathering them.")], None)],
            ),
        ),
        (
            "fallen_thanks",
            tell(
                &[Line {
                    by: Npc(Id::Ugra),
                    face: Some(Generic(Happy)),
                    text: &[
                        plain("You carry them gently. "),
                        styled("Good.", &[Fx::PauseAfter(Millis(500.0))]),
                        plain(" Tonight, they sleep."),
                    ],
                }],
                &[choice(&[plain("Farewell, Ugra.")], None)],
            ),
        ),
    ],
};
