use crate::core::assets::AssetRef;
use crate::core::math::{Pos, Rect, Size};
use crate::core::script::{Expr, VarValue};
use crate::core::tiling::Tiles;
use crate::data::item::Id as ItemId;
use crate::data::memory::Id as MemoryId;
use crate::data::notification::Id as NotificationId;
use crate::data::npc::Id as NpcId;
use crate::data::quest::Id as QuestId;
use crate::data::script::Id as ScriptId;
use crate::data::shop::Id as ShopId;
use crate::systems::area::warp::Warp;
use crate::systems::area::{AreaDef, AreaModule, ObjectDef, ObjectShape};
use crate::systems::interact::Verb;
use crate::systems::item::ItemStack;
use crate::systems::item::effects::Items;
use crate::systems::memory::Remember;
use crate::systems::notification::Notify;
use crate::systems::quest::effects::{CompleteTask, TurnIn};
use crate::systems::script::Speaker::{Narrator, Object};
use crate::systems::script::{
    Condition, DialogueNode, Fill, InlineScript, Line, Node, Place, RiftEffect, RiftEvent,
    RiftQuery, ScriptModule, Who, choice,
};
use crate::systems::shop::OpenShop;
use crate::systems::text::{Fx, Ink, Voice, plain, styled};

const ROAD_PASSES: Condition = Expr::Query(RiftQuery::Holding {
    of: None,
    item: ItemId::RoadPass,
});
const HOLDS_ROAD_PASS: Condition = Expr::AtLeast(&ROAD_PASSES, &Expr::Int(1));
const PELL_FIGHTING: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::PellFighting,
});
const PELL_DEAD_LATELY: Condition = Expr::Query(RiftQuery::SetWithin {
    of: None,
    memory: MemoryId::PellDead,
    seconds: &Expr::Int(1800),
});
const PELL_SHOWN: Condition = Expr::All(&[Expr::Not(&PELL_FIGHTING), Expr::Not(&PELL_DEAD_LATELY)]);
const HEARD_GULLS_LATELY: Condition = Expr::Query(RiftQuery::SetWithin {
    of: None,
    memory: MemoryId::HeardGulls,
    seconds: &Expr::Int(600),
});
const FOUND_TATTERED_MAP: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::FoundTatteredMap,
});
const TIDE_CHEST_LOOTED: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::TideChestLooted,
});
const ON_X_MARKS: Condition = Expr::Query(RiftQuery::OnQuest {
    of: None,
    quest: QuestId::XMarksTheSpot,
});

crate::table! {
    Island: AreaDef {
        name: "The island",
        map: AssetRef("maps/island.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("forest-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(38.5, 25.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Inline(FOREST_ROAD)],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("notice-board"),
                label: Some("Harbour notices"),
                shape: ObjectShape::Point(Pos::new(40.0, 19.0)),
                look: Some(AssetRef("icons/misc/scroll.png")),
                shown: None,
                scripts: &[ScriptModule::Inline(HARBOUR_BOARD)],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("tide-chest"),
                label: Some("Tide chest"),
                shape: ObjectShape::Point(Pos::new(46.0, 29.0)),
                look: Some(AssetRef("icons/misc/chest.png")),
                shown: None,
                scripts: &[ScriptModule::Inline(TIDE_CHEST)],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("honesty-box"),
                label: Some("Honesty box"),
                shape: ObjectShape::Point(Pos::new(42.0, 26.0)),
                look: Some(AssetRef("icons/misc/crate.png")),
                shown: None,
                scripts: &[ScriptModule::Inline(HONESTY_BOX)],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("ferry-pier"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(45.5, 24.5), Size::new(3.0, 3.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Inline(FERRY_PIER)],
            }),
            AreaModule::Population { npc: NpcId::Orc, count: 6, roams: None },
            AreaModule::Population { npc: NpcId::Skeleton, count: 8, roams: None },
            AreaModule::Population { npc: NpcId::VampireBat, count: 5, roams: None },
            AreaModule::Population { npc: NpcId::Bat, count: 4, roams: None },
            AreaModule::Population { npc: NpcId::OrcChief, count: 2, roams: None },
            AreaModule::Resident { npc: NpcId::Grisha, at: Pos::new(34.0, 27.0), shown: None },
            AreaModule::Resident { npc: NpcId::Mara, at: Pos::new(43.0, 21.0), shown: None },
            AreaModule::Resident { npc: NpcId::Tobb, at: Pos::new(50.0, 26.0), shown: None },
            AreaModule::Resident { npc: NpcId::Bram, at: Pos::new(44.0, 28.0), shown: None },
            AreaModule::Resident { npc: NpcId::Wren, at: Pos::new(33.0, 29.0), shown: None },
            AreaModule::Resident { npc: NpcId::Pell, at: Pos::new(43.0, 30.0), shown: Some(&PELL_SHOWN) },
            AreaModule::Resident { npc: NpcId::Ilsa, at: Pos::new(36.0, 25.0), shown: None },
        ],
    },
    Forest: AreaDef {
        name: "The forest",
        map: AssetRef("maps/forest.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("island-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(2.5, 20.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Island, at: Pos::new(39.0, 28.0) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("bloomvale-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(41.5, 5.5), Size::new(3.0, 3.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Bloomvale, at: Pos::new(2.5, 32.0) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("standing-stone"),
                label: Some("Standing stone"),
                shape: ObjectShape::Point(Pos::new(36.0, 6.0)),
                look: Some(AssetRef("icons/misc/rune_stone.png")),
                shown: None,
                scripts: &[ScriptModule::Inline(STANDING_STONE)],
            }),
            AreaModule::Script(ScriptModule::Inline(FOREST_INTRO)),
            AreaModule::Population { npc: NpcId::Orc, count: 8, roams: None },
            AreaModule::Population { npc: NpcId::OrcChief, count: 3, roams: None },
            AreaModule::Population { npc: NpcId::Skeleton, count: 5, roams: None },
            AreaModule::Population { npc: NpcId::Bat, count: 6, roams: None },
            AreaModule::Resident { npc: NpcId::Ugra, at: Pos::new(11.0, 15.0), shown: None },
        ],
    },
    Frostmere: AreaDef {
        name: "Frostmere",
        map: AssetRef("maps/frostmere.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("huntress-cabin"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(34.5, 18.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::FrostmereCabin, at: Pos::new(8.0, 9.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("jarl-longhouse"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(18.5, 14.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::FrostmereLonghouse, at: Pos::new(10.0, 13.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("west-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(-0.5, 19.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Amberwood, at: Pos::new(49.5, 31.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("wolf-trail"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(61.5, 33.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Gloomhollow, at: Pos::new(2.5, 35.0) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::DireWolf, count: 6, roams: Some(Rect::new(Pos::new(35.5, 23.5), Size::new(28.0, 28.0))) },
            AreaModule::Population { npc: NpcId::FrostWraith, count: 4, roams: Some(Rect::new(Pos::new(-0.5, 23.5), Size::new(26.0, 28.0))) },
            AreaModule::Resident { npc: NpcId::Trapper, at: Pos::new(6.0, 21.0), shown: None },
        ],
    },
    FrostmereCabin: AreaDef {
        name: "The huntress's cabin",
        map: AssetRef("maps/frostmere-cabin.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(6.5, 9.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Frostmere, at: Pos::new(35.5, 20.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Huntress, at: Pos::new(3.0, 7.0), shown: None },
        ],
    },
    FrostmereLonghouse: AreaDef {
        name: "The jarl's longhouse",
        map: AssetRef("maps/frostmere-longhouse.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(8.5, 13.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Frostmere, at: Pos::new(19.5, 16.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Jarl, at: Pos::new(9.0, 4.0), shown: None },
        ],
    },
    Sunscar: AreaDef {
        name: "Sunscar",
        map: AssetRef("maps/sunscar.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("potter-home"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(20.5, 13.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::SunscarAdobe, at: Pos::new(7.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("potter-workshop"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(23.5, 13.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::SunscarAdobe, at: Pos::new(17.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("silk-pavilion"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(44.5, 13.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::SunscarPavilion, at: Pos::new(8.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("north-pass"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(14.5, -0.5), Size::new(3.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Verdant, at: Pos::new(16.5, 81.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("east-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(69.5, 26.5), Size::new(2.0, 3.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Emberfall, at: Pos::new(2.5, 30.5) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::Scorpion, count: 5, roams: Some(Rect::new(Pos::new(54.5, 7.5), Size::new(14.0, 17.0))) },
            AreaModule::Population { npc: NpcId::Scorpion, count: 4, roams: Some(Rect::new(Pos::new(2.5, 32.5), Size::new(36.0, 19.0))) },
            AreaModule::Population { npc: NpcId::SandMummy, count: 5, roams: Some(Rect::new(Pos::new(47.5, 33.5), Size::new(21.0, 18.0))) },
            AreaModule::Resident { npc: NpcId::NomadMerchant, at: Pos::new(27.0, 24.0), shown: None },
        ],
    },
    SunscarAdobe: AreaDef {
        name: "The potter's house",
        map: AssetRef("maps/sunscar-adobe.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("home-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(5.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sunscar, at: Pos::new(21.5, 15.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("workshop-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(15.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sunscar, at: Pos::new(24.5, 15.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Potter, at: Pos::new(17.0, 10.0), shown: None },
        ],
    },
    SunscarPavilion: AreaDef {
        name: "The silk prince's pavilion",
        map: AssetRef("maps/sunscar-pavilion.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(6.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sunscar, at: Pos::new(45.5, 15.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::SilkPrince, at: Pos::new(7.0, 5.0), shown: None },
        ],
    },
    Bloomvale: AreaDef {
        name: "Bloomvale",
        map: AssetRef("maps/bloomvale.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("inn-taproom"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(39.5, 27.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::BloomvaleInn, at: Pos::new(15.0, 19.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("inn-kitchen"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(43.5, 26.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::BloomvaleInn, at: Pos::new(28.0, 19.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("inn-stable"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(45.5, 26.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::BloomvaleInn, at: Pos::new(36.0, 19.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("mill"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(18.5, 20.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::BloomvaleMill, at: Pos::new(7.0, 9.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("baker-cottage"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(25.5, 28.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::BloomvaleCottage, at: Pos::new(9.0, 10.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("forest-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(-0.5, 30.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Forest, at: Pos::new(41.5, 7.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("amberwood-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(32.5, -0.5), Size::new(3.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Amberwood, at: Pos::new(31.5, 81.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("sakura-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(85.5, 25.5), Size::new(2.0, 3.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sakura, at: Pos::new(2.5, 45.0) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("fen-path"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(44.5, 61.5), Size::new(3.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Mirefen, at: Pos::new(28.0, 2.5) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::WildBoar, count: 6, roams: Some(Rect::new(Pos::new(0.5, 45.5), Size::new(22.0, 16.0))) },
            AreaModule::Population { npc: NpcId::GiantBee, count: 6, roams: Some(Rect::new(Pos::new(24.5, 45.5), Size::new(15.0, 16.0))) },
            AreaModule::Resident { npc: NpcId::FarmerGirl, at: Pos::new(27.0, 37.0), shown: None },
        ],
    },
    BloomvaleInn: AreaDef {
        name: "The crossroads inn",
        map: AssetRef("maps/bloomvale-inn.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("taproom-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(13.5, 19.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Bloomvale, at: Pos::new(41.0, 29.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("kitchen-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(26.5, 19.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Bloomvale, at: Pos::new(45.0, 28.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("stable-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(34.5, 19.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Bloomvale, at: Pos::new(47.0, 28.5) }))],
                }],
            }),
        ],
    },
    BloomvaleCottage: AreaDef {
        name: "The baker's cottage",
        map: AssetRef("maps/bloomvale-cottage.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(7.5, 10.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Bloomvale, at: Pos::new(26.5, 30.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Baker, at: Pos::new(5.0, 8.0), shown: None },
        ],
    },
    BloomvaleMill: AreaDef {
        name: "The windmill",
        map: AssetRef("maps/bloomvale-mill.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(5.5, 9.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Bloomvale, at: Pos::new(20.0, 22.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Miller, at: Pos::new(7.0, 7.0), shown: None },
        ],
    },
    Amberwood: AreaDef {
        name: "Amberwood",
        map: AssetRef("maps/amberwood.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("barn-doors"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(42.5, 64.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::AmberwoodBarn, at: Pos::new(8.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("stable-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(45.5, 64.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::AmberwoodBarn, at: Pos::new(18.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("woodsman-cabin"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(22.5, 45.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::AmberwoodCabin, at: Pos::new(8.0, 9.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("bloomvale-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(29.5, 81.5), Size::new(3.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Bloomvale, at: Pos::new(34.5, 2.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("frostmere-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(49.5, 29.5), Size::new(2.0, 3.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Frostmere, at: Pos::new(2.5, 21.0) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::BrownBear, count: 4, roams: Some(Rect::new(Pos::new(-0.5, -0.5), Size::new(52.0, 25.0))) },
            AreaModule::Population { npc: NpcId::Goblin, count: 6, roams: Some(Rect::new(Pos::new(-0.5, 29.5), Size::new(13.0, 40.0))) },
            AreaModule::Resident { npc: NpcId::Lumberjack, at: Pos::new(44.0, 44.0), shown: None },
        ],
    },
    AmberwoodBarn: AreaDef {
        name: "The farm's barn",
        map: AssetRef("maps/amberwood-barn.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("barn-doors"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(6.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Amberwood, at: Pos::new(44.0, 66.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("stable-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(16.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Amberwood, at: Pos::new(46.5, 66.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Farmhand, at: Pos::new(19.0, 8.0), shown: None },
        ],
    },
    AmberwoodCabin: AreaDef {
        name: "The old woodsman's cabin",
        map: AssetRef("maps/amberwood-cabin.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(6.5, 9.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Amberwood, at: Pos::new(23.5, 47.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::OldWoodsman, at: Pos::new(5.0, 7.0), shown: None },
        ],
    },
    Gloomhollow: AreaDef {
        name: "Gloomhollow",
        map: AssetRef("maps/gloomhollow.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("chapel-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(22.5, 21.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::GloomhollowChapel, at: Pos::new(8.0, 13.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("chapel-side-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(25.5, 21.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::GloomhollowChapel, at: Pos::new(18.0, 13.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("crypt"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(46.5, 16.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::GloomhollowCrypt, at: Pos::new(7.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("frostmere-trail"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(-0.5, 33.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Frostmere, at: Pos::new(61.5, 35.0) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("glimmercap-path"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(25.5, 69.5), Size::new(3.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Glimmercap, at: Pos::new(24.5, 2.5) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::Ghost, count: 5, roams: Some(Rect::new(Pos::new(10.5, 22.5), Size::new(29.0, 15.0))) },
            AreaModule::Population { npc: NpcId::Ghost, count: 3, roams: Some(Rect::new(Pos::new(39.5, 5.5), Size::new(17.0, 17.0))) },
            AreaModule::Population { npc: NpcId::Ghost, count: 3, roams: Some(Rect::new(Pos::new(4.5, 54.5), Size::new(14.0, 10.0))) },
            AreaModule::Population { npc: NpcId::Ghoul, count: 3, roams: Some(Rect::new(Pos::new(39.5, 5.5), Size::new(17.0, 17.0))) },
            AreaModule::Population { npc: NpcId::Ghoul, count: 4, roams: Some(Rect::new(Pos::new(11.5, 40.5), Size::new(11.0, 18.0))) },
            AreaModule::Population { npc: NpcId::Ghoul, count: 5, roams: Some(Rect::new(Pos::new(32.5, 42.5), Size::new(21.0, 17.0))) },
        ],
    },
    GloomhollowChapel: AreaDef {
        name: "The chapel",
        map: AssetRef("maps/gloomhollow-chapel.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("nave-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(6.5, 13.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Gloomhollow, at: Pos::new(23.5, 23.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("quarters-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(16.5, 13.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Gloomhollow, at: Pos::new(26.5, 23.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Gravedigger, at: Pos::new(12.0, 12.0), shown: None },
            AreaModule::Resident { npc: NpcId::Priest, at: Pos::new(19.0, 8.0), shown: None },
        ],
    },
    GloomhollowCrypt: AreaDef {
        name: "The crypt",
        map: AssetRef("maps/gloomhollow-crypt.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("crypt-gate"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(5.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Gloomhollow, at: Pos::new(48.0, 18.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::CryptKeeper, at: Pos::new(9.0, 8.0), shown: None },
        ],
    },
    Glimmercap: AreaDef {
        name: "Glimmercap",
        map: AssetRef("maps/glimmercap.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("hollow-tree"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(30.5, 25.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::GlimmercapTree, at: Pos::new(9.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("mushroom-house"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(10.5, 38.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::GlimmercapMushroom, at: Pos::new(8.0, 10.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("gloomhollow-path"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(22.5, -0.5), Size::new(3.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Gloomhollow, at: Pos::new(27.5, 69.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("sakura-path"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(-0.5, 28.5), Size::new(2.0, 3.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sakura, at: Pos::new(53.5, 46.0) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::Myconid, count: 6, roams: Some(Rect::new(Pos::new(50.5, 7.5), Size::new(13.0, 48.0))) },
            AreaModule::Population { npc: NpcId::GlowMoth, count: 6, roams: Some(Rect::new(Pos::new(5.5, 47.5), Size::new(38.0, 11.0))) },
            AreaModule::Resident { npc: NpcId::GnomeAlchemist, at: Pos::new(38.0, 41.0), shown: None },
        ],
    },
    GlimmercapMushroom: AreaDef {
        name: "The fairy's mushroom",
        map: AssetRef("maps/glimmercap-mushroom.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(6.5, 10.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Glimmercap, at: Pos::new(11.5, 40.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Fairy, at: Pos::new(7.0, 6.0), shown: None },
        ],
    },
    GlimmercapTree: AreaDef {
        name: "The druid's tree",
        map: AssetRef("maps/glimmercap-tree.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(7.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Glimmercap, at: Pos::new(31.5, 27.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Druid, at: Pos::new(5.0, 7.0), shown: None },
        ],
    },
    Sakura: AreaDef {
        name: "Sakura",
        map: AssetRef("maps/sakura.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("estate-gate"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(25.5, 39.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::SakuraEstate, at: Pos::new(14.0, 25.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("estate-kitchen"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(30.5, 39.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::SakuraEstate, at: Pos::new(31.0, 25.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("teahouse"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(10.5, 41.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::SakuraTeahouse, at: Pos::new(9.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("temple"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(48.5, 40.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::SakuraPagoda, at: Pos::new(8.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("bloomvale-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(-0.5, 43.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Bloomvale, at: Pos::new(85.5, 27.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("glimmercap-path"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(53.5, 44.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Glimmercap, at: Pos::new(2.5, 30.5) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::Kitsune, count: 6, roams: Some(Rect::new(Pos::new(34.5, 8.5), Size::new(11.0, 8.0))) },
            AreaModule::Population { npc: NpcId::Ronin, count: 4, roams: Some(Rect::new(Pos::new(19.5, 60.5), Size::new(34.0, 21.0))) },
            AreaModule::Population { npc: NpcId::Ronin, count: 2, roams: Some(Rect::new(Pos::new(3.5, 63.5), Size::new(15.0, 14.0))) },
            AreaModule::Resident { npc: NpcId::Monk, at: Pos::new(46.0, 42.0), shown: None },
        ],
    },
    SakuraEstate: AreaDef {
        name: "The lord's estate",
        map: AssetRef("maps/sakura-estate.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("gate-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(12.5, 25.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sakura, at: Pos::new(27.0, 41.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("kitchen-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(29.5, 25.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sakura, at: Pos::new(32.0, 41.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::SamuraiLord, at: Pos::new(17.0, 6.0), shown: None },
        ],
    },
    SakuraTeahouse: AreaDef {
        name: "The teahouse",
        map: AssetRef("maps/sakura-teahouse.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(7.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sakura, at: Pos::new(11.5, 43.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::TeaMaster, at: Pos::new(6.0, 5.0), shown: None },
        ],
    },
    SakuraPagoda: AreaDef {
        name: "The temple",
        map: AssetRef("maps/sakura-pagoda.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(6.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sakura, at: Pos::new(49.5, 42.5) }))],
                }],
            }),
        ],
    },
    Mirefen: AreaDef {
        name: "Mirefen",
        map: AssetRef("maps/mirefen.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("fisher-stilt"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(39.5, 20.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::MirefenStilt, at: Pos::new(6.0, 9.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("witch-hut"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(11.5, 22.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::MirefenWitch, at: Pos::new(8.0, 11.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("bloomvale-path"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(26.5, -0.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Bloomvale, at: Pos::new(46.5, 61.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("jungle-path"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(59.5, 55.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Verdant, at: Pos::new(21.5, 2.5) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::BogLurker, count: 6, roams: Some(Rect::new(Pos::new(67.5, 3.5), Size::new(26.0, 50.0))) },
            AreaModule::Population { npc: NpcId::SwampSlime, count: 8, roams: Some(Rect::new(Pos::new(2.5, 41.5), Size::new(41.0, 12.0))) },
            AreaModule::Resident { npc: NpcId::EelFisher, at: Pos::new(46.0, 23.0), shown: None },
        ],
    },
    MirefenStilt: AreaDef {
        name: "The fisher's stilt house",
        map: AssetRef("maps/mirefen-stilt.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(4.5, 9.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Mirefen, at: Pos::new(41.0, 22.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::FisherBoy, at: Pos::new(10.0, 7.0), shown: None },
        ],
    },
    MirefenWitch: AreaDef {
        name: "The witch's hut",
        map: AssetRef("maps/mirefen-witch.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(6.5, 11.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Mirefen, at: Pos::new(12.5, 24.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::SwampWitch, at: Pos::new(11.0, 8.0), shown: None },
        ],
    },
    Verdant: AreaDef {
        name: "Verdant",
        map: AssetRef("maps/verdant.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("shaman-hut"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(21.5, 25.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::VerdantHut, at: Pos::new(8.0, 9.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("vine-temple"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(9.5, 57.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::VerdantTemple, at: Pos::new(9.0, 15.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("fen-path"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(19.5, -0.5), Size::new(3.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Mirefen, at: Pos::new(61.0, 55.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("desert-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(14.5, 81.5), Size::new(3.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sunscar, at: Pos::new(16.5, 2.5) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::Panther, count: 5, roams: Some(Rect::new(Pos::new(41.5, 5.5), Size::new(13.0, 36.0))) },
            AreaModule::Population { npc: NpcId::Lizardman, count: 6, roams: Some(Rect::new(Pos::new(42.5, 51.5), Size::new(12.0, 28.0))) },
            AreaModule::Resident { npc: NpcId::Explorer, at: Pos::new(24.0, 69.0), shown: None },
        ],
    },
    VerdantHut: AreaDef {
        name: "The shaman's hut",
        map: AssetRef("maps/verdant-hut.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(6.5, 9.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Verdant, at: Pos::new(22.5, 27.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Shaman, at: Pos::new(7.0, 5.0), shown: None },
        ],
    },
    VerdantTemple: AreaDef {
        name: "The vine temple",
        map: AssetRef("maps/verdant-temple.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(7.5, 15.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Verdant, at: Pos::new(10.5, 59.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Archaeologist, at: Pos::new(6.0, 13.0), shown: None },
        ],
    },
    Emberfall: AreaDef {
        name: "Emberfall",
        map: AssetRef("maps/emberfall.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("forge-home"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(21.5, 28.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::EmberfallForge, at: Pos::new(7.0, 12.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("forge-smithy"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(24.5, 28.5), Size::new(2.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::EmberfallForge, at: Pos::new(18.0, 12.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("fire-shrine"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(49.5, 28.5), Size::new(1.0, 1.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::EmberfallShrine, at: Pos::new(9.0, 12.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("desert-road"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(-0.5, 28.5), Size::new(2.0, 3.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Sunscar, at: Pos::new(69.5, 28.5) }))],
                }],
            }),
            AreaModule::Population { npc: NpcId::LavaGolem, count: 4, roams: Some(Rect::new(Pos::new(35.5, 3.5), Size::new(20.0, 14.0))) },
            AreaModule::Population { npc: NpcId::MagmaImp, count: 7, roams: Some(Rect::new(Pos::new(61.5, 17.5), Size::new(22.0, 38.0))) },
            AreaModule::Resident { npc: NpcId::DwarfMiner, at: Pos::new(45.0, 20.0), shown: None },
        ],
    },
    EmberfallForge: AreaDef {
        name: "The forge",
        map: AssetRef("maps/emberfall-forge.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("home-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(5.5, 12.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Emberfall, at: Pos::new(23.0, 30.5) }))],
                }],
            }),
            AreaModule::Object(ObjectDef {
                name: Some("forge-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(16.5, 12.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Emberfall, at: Pos::new(26.0, 30.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::Blacksmith, at: Pos::new(18.0, 8.0), shown: None },
        ],
    },
    EmberfallShrine: AreaDef {
        name: "The fire shrine",
        map: AssetRef("maps/emberfall-shrine.tmx"),
        modules: &[
            AreaModule::Object(ObjectDef {
                name: Some("front-door"),
                label: None,
                shape: ObjectShape::Rect(Rect::new(Pos::new(7.5, 12.5), Size::new(2.0, 2.0))),
                look: None,
                shown: None,
                scripts: &[ScriptModule::Shared {
                    script: ScriptId::Warp,
                    values: &[("to", VarValue::Place(Place { area: Id::Emberfall, at: Pos::new(50.5, 30.5) }))],
                }],
            }),
            AreaModule::Resident { npc: NpcId::FirePriestess, at: Pos::new(9.0, 6.0), shown: None },
        ],
    },
}

const HARBOUR_BOARD: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "interacted",
            Node::On {
                event: RiftEvent::Interacted {
                    verb: Verb::Read,
                    reach: Tiles(1.5),
                    marks: &[],
                    news: false,
                },
                next: Some("read"),
            },
        ),
        (
            "read",
            Node::Dialogue(DialogueNode {
                lines: &[
                    Line {
                        by: Narrator,
                        face: None,
                        text: &[plain(
                            "Notices flap on the post, nailed over older notices.",
                        )],
                    },
                    Line {
                        by: Object,
                        face: None,
                        text: &[
                            styled("FERRY SUSPENDED", &[Fx::Voice(Voice::Shout)]),
                            plain(" until the orc trouble passes. By order of "),
                            styled("Captain Bram", &[Fx::Ink(Ink::Name)]),
                            plain("."),
                        ],
                    },
                    Line {
                        by: Object,
                        face: None,
                        text: &[
                            plain("WANTED: strong arms for the "),
                            styled("north shore", &[Fx::Ink(Ink::Place)]),
                            plain(". Ask "),
                            styled("Mara", &[Fx::Ink(Ink::Name)]),
                            plain(" at the market."),
                        ],
                    },
                ],
                choices: &[choice(&[plain("Step away.")], None)],
                next: None,
                left: None,
            }),
        ),
    ],
};

const TIDE_CHEST: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "interacted",
            Node::On {
                event: RiftEvent::Interacted {
                    verb: Verb::Open,
                    reach: Tiles(1.5),
                    marks: &[],
                    news: false,
                },
                next: Some("map_found"),
            },
        ),
        (
            "map_found",
            Node::If {
                test: FOUND_TATTERED_MAP,
                yes: Some("looted"),
                no: Some("loot_map"),
            },
        ),
        (
            "loot_map",
            Node::Effect(RiftEffect::Items(Items {
                who: None,
                take: &[],
                give: &[
                    ItemStack::new(ItemId::Gold, 5),
                    ItemStack::new(ItemId::TatteredMap, 1),
                ],
                done: Some("remember_map"),
                refused: None,
            })),
        ),
        (
            "remember_map",
            Node::Effect(RiftEffect::Remember(Remember {
                who: None,
                memory: MemoryId::FoundTatteredMap,
                to: None,
                next: Some("remember_looted_map"),
            })),
        ),
        (
            "remember_looted_map",
            Node::Effect(RiftEffect::Remember(Remember {
                who: None,
                memory: MemoryId::TideChestLooted,
                to: None,
                next: Some("map"),
            })),
        ),
        (
            "map",
            Node::Dialogue(DialogueNode {
                lines: &[
                    Line {
                        by: Narrator,
                        face: None,
                        text: &[
                            plain("You find five "),
                            styled("Gold", &[Fx::Ink(Ink::Item)]),
                            plain(" coins. Under them, a scrap of oilcloth is wrapped around a "),
                            styled("tattered map", &[Fx::Ink(Ink::Item)]),
                            plain("."),
                        ],
                    },
                    Line {
                        by: Narrator,
                        face: None,
                        text: &[styled(
                            "Unfold it from your bag to read it.",
                            &[Fx::Voice(Voice::Whisper)],
                        )],
                    },
                ],
                choices: &[choice(&[plain("Close the lid.")], None)],
                next: None,
                left: None,
            }),
        ),
        (
            "looted",
            Node::If {
                test: TIDE_CHEST_LOOTED,
                yes: Some("empty"),
                no: Some("loot"),
            },
        ),
        (
            "loot",
            Node::Effect(RiftEffect::Items(Items {
                who: None,
                take: &[],
                give: &[ItemStack::new(ItemId::Gold, 5)],
                done: Some("remember_looted"),
                refused: None,
            })),
        ),
        (
            "remember_looted",
            Node::Effect(RiftEffect::Remember(Remember {
                who: None,
                memory: MemoryId::TideChestLooted,
                to: None,
                next: Some("found"),
            })),
        ),
        (
            "found",
            Node::Dialogue(DialogueNode {
                lines: &[
                    Line {
                        by: Narrator,
                        face: None,
                        text: &[plain(
                            "Wedged between the rocks, the chest is heavy with the tide's leavings.",
                        )],
                    },
                    Line {
                        by: Narrator,
                        face: None,
                        text: &[
                            plain("You find five "),
                            styled("Gold", &[Fx::Ink(Ink::Item)]),
                            plain(" coins."),
                        ],
                    },
                ],
                choices: &[choice(&[plain("Close the lid.")], None)],
                next: None,
                left: None,
            }),
        ),
        (
            "empty",
            Node::Dialogue(DialogueNode {
                lines: &[Line {
                    by: Narrator,
                    face: None,
                    text: &[
                        plain("Only sand, and a crab that does not appreciate the visit. "),
                        styled(
                            "The tide brings more each day.",
                            &[Fx::Voice(Voice::Whisper)],
                        ),
                    ],
                }],
                choices: &[choice(&[plain("Close the lid.")], None)],
                next: None,
                left: None,
            }),
        ),
    ],
};

const HONESTY_BOX: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "interacted",
            Node::On {
                event: RiftEvent::Interacted {
                    verb: Verb::Use,
                    reach: Tiles(1.5),
                    marks: &[],
                    news: false,
                },
                next: Some("note"),
            },
        ),
        (
            "note",
            Node::Dialogue(DialogueNode {
                lines: &[Line {
                    by: Narrator,
                    face: None,
                    text: &[
                        plain("Fish steaks wrapped in leaves, and a slot for coins. A note in "),
                        styled("Tobb", &[Fx::Ink(Ink::Name)]),
                        plain("'s hand: "),
                        styled("pay what's written.", &[Fx::Voice(Voice::Whisper)]),
                    ],
                }],
                choices: &[],
                next: Some("shop"),
                left: None,
            }),
        ),
        (
            "shop",
            Node::Effect(RiftEffect::OpenShop(OpenShop {
                who: None,
                shop: ShopId::HonestyBox,
                closed: None,
            })),
        ),
    ],
};

const FERRY_PIER: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "entered",
            Node::On {
                event: RiftEvent::Entered {
                    by: Who::Characters,
                },
                next: Some("heard"),
            },
        ),
        (
            "heard",
            Node::If {
                test: HEARD_GULLS_LATELY,
                yes: None,
                no: Some("remember"),
            },
        ),
        (
            "remember",
            Node::Effect(RiftEffect::Remember(Remember {
                who: None,
                memory: MemoryId::HeardGulls,
                to: None,
                next: Some("gulls"),
            })),
        ),
        (
            "gulls",
            Node::Effect(RiftEffect::Notify(Notify {
                who: None,
                notification: NotificationId::Gulls,
                next: None,
            })),
        ),
    ],
};

const FOREST_ROAD: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "entered",
            Node::On {
                event: RiftEvent::Entered {
                    by: Who::Characters,
                },
                next: Some("pass"),
            },
        ),
        (
            "pass",
            Node::If {
                test: HOLDS_ROAD_PASS,
                yes: Some("cross"),
                no: None,
            },
        ),
        (
            "cross",
            Node::Effect(RiftEffect::Warp(Warp {
                who: None,
                to: Fill::Const(Place {
                    area: Id::Forest,
                    at: Pos::new(3.0, 18.0),
                }),
                next: None,
            })),
        ),
    ],
};

const STANDING_STONE: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "interacted",
            Node::On {
                event: RiftEvent::Interacted {
                    verb: Verb::Use,
                    reach: Tiles(1.5),
                    marks: &[],
                    news: false,
                },
                next: Some("on_quest"),
            },
        ),
        (
            "on_quest",
            Node::If {
                test: ON_X_MARKS,
                yes: Some("found"),
                no: Some("look"),
            },
        ),
        (
            "found",
            Node::Effect(RiftEffect::CompleteTask(CompleteTask {
                who: None,
                quest: QuestId::XMarksTheSpot,
                task: "find_stone",
                next: Some("matches"),
            })),
        ),
        (
            "matches",
            Node::Dialogue(DialogueNode {
                lines: &[Line {
                    by: Narrator,
                    face: None,
                    text: &[plain(
                        "The stone matches the drawing, down to the crack in its side.",
                    )],
                }],
                choices: &[],
                next: Some("turn_in"),
                left: None,
            }),
        ),
        (
            "turn_in",
            Node::Effect(RiftEffect::TurnIn(TurnIn {
                who: None,
                quest: QuestId::XMarksTheSpot,
                done: None,
                refused: None,
                cancelled: None,
            })),
        ),
        (
            "look",
            Node::Dialogue(DialogueNode {
                lines: &[Line {
                    by: Narrator,
                    face: None,
                    text: &[plain(
                        "Moss has crept over the runes. Whoever carved them wanted them found, then forgot why.",
                    )],
                }],
                choices: &[choice(&[plain("Step away.")], None)],
                next: None,
                left: None,
            }),
        ),
    ],
};

const FOREST_INTRO: InlineScript = InlineScript {
    state: &[],
    locals: &[],
    nodes: &[
        (
            "discovered",
            Node::On {
                event: RiftEvent::Discovered,
                next: Some("intro"),
            },
        ),
        (
            "intro",
            Node::Effect(RiftEffect::Notify(Notify {
                who: None,
                notification: NotificationId::ForestIntro,
                next: None,
            })),
        ),
    ],
};
