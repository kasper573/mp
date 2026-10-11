use crate::core::math::Percent;
use crate::core::script::Expr;
use crate::core::time::Seconds;
use crate::data::item::Id as ItemId;
use crate::data::memory::Id as MemoryId;
use crate::data::npc::Id as NpcId;
use crate::systems::dialogue::ChoiceReveal::{Costs, Gains, Locked, Needs};
use crate::systems::item::ItemStack;
use crate::systems::quest::{DecisionPath, Objective, QuestDef, QuestDrop, QuestModule};
use crate::systems::script::{Condition, RiftQuery};
use crate::systems::text::plain;

const LEVEL: Condition = Expr::Query(RiftQuery::Level { of: None });
const SIDED_WITH_ORCS: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::SidedWithOrcs,
});
const NOT_SIDED_WITH_ORCS: Condition = Expr::Not(&SIDED_WITH_ORCS);
const LEVEL_2: Condition = Expr::AtLeast(&LEVEL, &Expr::Int(2));
const ON_TUSKS: Condition = Expr::Query(RiftQuery::OnQuest {
    of: None,
    quest: Id::TusksForTheChief,
});
const BATS_REQUIRES: Condition = Expr::All(&[
    Expr::AtLeast(&LEVEL, &Expr::Int(3)),
    Expr::Query(RiftQuery::QuestDone {
        of: None,
        quest: Id::LetterForTheCaptain,
    }),
]);

crate::table! {
    TusksForTheChief: QuestDef {
        title: "Tusks for the Chief",
        category: "Orc Trouble",
        blurb: "Orcs from the north shore keep raiding my crates. Bring me five of their tusks, and if you can, put that brute of a chief in the sand.",
        xp: 120,
        reveal: &[Locked, Needs, Costs, Gains],
        modules: &[
            QuestModule::Shown(&NOT_SIDED_WITH_ORCS),
            QuestModule::Requires(&LEVEL_2),
            QuestModule::Objective(Objective::Hold(ItemStack::new(ItemId::OrcTusk, 5))),
            QuestModule::Objective(Objective::Defeat { npc: NpcId::OrcChief, count: 1 }),
            QuestModule::HandIn(&[ItemStack::new(ItemId::OrcTusk, 5)]),
            QuestModule::Reward(&[ItemStack::new(ItemId::Gold, 35), ItemStack::new(ItemId::GreaterHealthPotion, 2)]),
            QuestModule::PickOne(&[
                ItemStack::new(ItemId::RustySword, 1),
                ItemStack::new(ItemId::BoneShield, 1),
                ItemStack::new(ItemId::TribalHelmet, 1),
            ]),
        ],
    },
    ShamansPlea: QuestDef {
        title: "The Shaman's Plea",
        category: "Orc Trouble",
        blurb: "Those tusks were cut from our dead. Return them, and the clan will remember you.",
        xp: 80,
        reveal: &[],
        modules: &[
            QuestModule::Shown(&ON_TUSKS),
            QuestModule::Objective(Objective::Decide {
                label: "Answer Ugra",
                paths: &[
                    DecisionPath {
                        choice: "Give the tusks",
                        means: &[
                            "Tusks for the Chief fails",
                            "Ugra becomes a friend, with quests and goods of her own",
                            "Mara greets you coldly and won't buy orc goods",
                        ],
                    },
                    DecisionPath {
                        choice: "Keep them",
                        means: &["Tusks for the Chief continues", "Ugra never speaks to you again"],
                    },
                ],
            }),
        ],
    },
    RestForTheFallen: QuestDef {
        title: "Rest for the Fallen",
        category: "Orc Trouble",
        blurb: "The skeletons on the shore were warriors once. Bring me their bones, and I will sing them to sleep.",
        xp: 80,
        reveal: &[Costs],
        modules: &[
            QuestModule::Shown(&SIDED_WITH_ORCS),
            QuestModule::Objective(Objective::Hold(ItemStack::new(ItemId::Bone, 8))),
            QuestModule::HandIn(&[ItemStack::new(ItemId::Bone, 8)]),
            QuestModule::HandOver(&[plain("Here are their bones.")]),
            QuestModule::Reward(&[ItemStack::new(ItemId::GreaterHealthPotion, 2)]),
        ],
    },
    LetterForTheCaptain: QuestDef {
        title: "A Letter for the Captain",
        category: "Harbour Errands",
        blurb: "Take this to Bram on his ship. I'd go myself, but my knees and that gangplank are not on speaking terms.",
        xp: 40,
        reveal: &[],
        modules: &[
            QuestModule::Grants(&[ItemStack::new(ItemId::TobbsLetter, 1)]),
            QuestModule::Objective(Objective::Deliver(ItemId::TobbsLetter)),
            QuestModule::HandIn(&[ItemStack::new(ItemId::TobbsLetter, 1)]),
            QuestModule::HandOver(&[plain("Tobb asked me to bring you this.")]),
            QuestModule::Reward(&[ItemStack::new(ItemId::Gold, 10)]),
        ],
    },
    BatsInTheBelfry: QuestDef {
        title: "Bats in the Belfry",
        category: "Harbour Errands",
        blurb: "Bats have taken the old belfry, and one of the devils made off with my key. Thin out the vampire ones and bring the key back.",
        xp: 150,
        reveal: &[Needs, Gains],
        modules: &[
            QuestModule::Requires(&BATS_REQUIRES),
            QuestModule::Objective(Objective::Defeat { npc: NpcId::VampireBat, count: 4 }),
            QuestModule::Objective(Objective::Hold(ItemStack::new(ItemId::BelfryKey, 1))),
            QuestModule::HandIn(&[ItemStack::new(ItemId::BelfryKey, 1)]),
            QuestModule::HandOver(&[plain("Here's your key.")]),
            QuestModule::Reward(&[ItemStack::new(ItemId::Gold, 25), ItemStack::new(ItemId::HealthPotion, 2)]),
            QuestModule::Drop(QuestDrop {
                from: NpcId::VampireBat,
                item: ItemId::BelfryKey,
                chance: Percent(10.0),
                grows: Percent(15.0),
            }),
        ],
    },
    LowTide: QuestDef {
        title: "Low Tide",
        category: "Harbour Errands",
        blurb: "Tide's turning and the gulls are hungry. Three fish steaks before it's out, and the bait is yours.",
        xp: 60,
        reveal: &[Costs, Gains],
        modules: &[
            QuestModule::Objective(Objective::Hold(ItemStack::new(ItemId::FishSteak, 3))),
            QuestModule::HandIn(&[ItemStack::new(ItemId::FishSteak, 3)]),
            QuestModule::HandOver(&[plain("Here are the steaks.")]),
            QuestModule::Reward(&[ItemStack::new(ItemId::Gold, 15), ItemStack::new(ItemId::FishingBait, 5)]),
            QuestModule::TimeLimit(Seconds(600.0)),
        ],
    },
    BoneTithe: QuestDef {
        title: "Bone Tithe",
        category: "Daily",
        blurb: "Ten bones a day keeps the dead from wandering. Bring them, and I'll pay in tokens.",
        xp: 30,
        reveal: &[Costs, Gains],
        modules: &[
            QuestModule::Objective(Objective::Hold(ItemStack::new(ItemId::Bone, 10))),
            QuestModule::HandIn(&[ItemStack::new(ItemId::Bone, 10)]),
            QuestModule::HandOver(&[plain("Here are today's bones.")]),
            QuestModule::Reward(&[ItemStack::new(ItemId::BoneToken, 6)]),
            QuestModule::Daily,
        ],
    },
    XMarksTheSpot: QuestDef {
        title: "X Marks the Spot",
        category: "Mysteries",
        blurb: "A cross, scrawled beside a standing stone in the Forest. Someone buried something there.",
        xp: 100,
        reveal: &[],
        modules: &[
            QuestModule::Objective(Objective::Task { task: "find_stone", label: "Find the standing stone" }),
            QuestModule::HandIn(&[ItemStack::new(ItemId::TatteredMap, 1)]),
            QuestModule::HandOver(&[plain("Dig where the cross says.")]),
            QuestModule::Reward(&[ItemStack::new(ItemId::Gold, 30), ItemStack::new(ItemId::CorsairCutlass, 1)]),
        ],
    },
}
