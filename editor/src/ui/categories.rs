use engine::core::audio::playback::{SfxDef, SfxRoleDef};
use engine::core::babble::{BabbleBankDef, BabbleDef};
use engine::core::content::ContentRow;
use engine::core::vfx::{VfxDef, VfxShaderDef};
use engine::systems::actor::ModelDef;
use engine::systems::area::AreaDef;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::tileset::{SurfaceDef, TilesetDef};
use engine::systems::area::world_map::WorldMapDef;
use engine::systems::attention::AttentionDef;
use engine::systems::class::ClassDef;
use engine::systems::input::map::InputDef;
use engine::systems::interface::{CursorDef, InterfaceIconDef};
use engine::systems::item::ItemDef;
use engine::systems::memory::MemoryDef;
use engine::systems::notification::NotificationDef;
use engine::systems::npc::NpcDef;
use engine::systems::player::PlayerDef;
use engine::systems::player::snapshot::CharacterSnapshot;
use engine::systems::quest::QuestDef;
use engine::systems::script::ScriptDef;
use engine::systems::shop::ShopDef;
use engine::systems::skill::SkillDef;
use engine::systems::status::StatusEffectDef;

/// A heading the content lists group tables under. Only a view: tables, files and keys know
/// nothing of it.
pub struct TableCategory {
    pub name: &'static str,
    pub tables: &'static [&'static str],
}

pub const CATEGORIES: &[TableCategory] = &[
    TableCategory {
        name: "World",
        tables: &[
            AreaDef::TABLE,
            WorldMapDef::TABLE,
            TilesetDef::TABLE,
            BlueprintDef::TABLE,
            SurfaceDef::TABLE,
        ],
    },
    TableCategory {
        name: "Characters",
        tables: &[
            NpcDef::TABLE,
            PlayerDef::TABLE,
            ClassDef::TABLE,
            ModelDef::TABLE,
            CharacterSnapshot::TABLE,
        ],
    },
    TableCategory {
        name: "Items & skills",
        tables: &[
            ItemDef::TABLE,
            SkillDef::TABLE,
            StatusEffectDef::TABLE,
            ShopDef::TABLE,
        ],
    },
    TableCategory {
        name: "Story",
        tables: &[
            QuestDef::TABLE,
            MemoryDef::TABLE,
            ScriptDef::TABLE,
            NotificationDef::TABLE,
        ],
    },
    TableCategory {
        name: "Visual effects",
        tables: &[VfxDef::TABLE, VfxShaderDef::TABLE],
    },
    TableCategory {
        name: "Sound & voice",
        tables: &[
            SfxDef::TABLE,
            SfxRoleDef::TABLE,
            BabbleDef::TABLE,
            BabbleBankDef::TABLE,
        ],
    },
    TableCategory {
        name: "Interface",
        tables: &[
            InputDef::TABLE,
            CursorDef::TABLE,
            InterfaceIconDef::TABLE,
            AttentionDef::TABLE,
        ],
    },
];

pub fn category_of(table: &str) -> Option<&'static TableCategory> {
    CATEGORIES
        .iter()
        .find(|category| category.tables.contains(&table))
}
