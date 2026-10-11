use crate::core::script::Expr;
use crate::core::time::Seconds;
use crate::data::attention::Id as AttentionId;
use crate::data::expression::Id as ExpressionId;
use crate::data::item::Id as ItemId;
use crate::data::memory::Id as MemoryId;
use crate::data::npc::Id as NpcId;
use crate::systems::actor::bust::Face::{Generic, Individual};
use crate::systems::actor::bust::GenericExpression::{Angry, Happy, Thinking};
use crate::systems::item::{ItemCategory, ItemStack};
use crate::systems::script::Speaker::Npc;
use crate::systems::script::{Condition, Line, RiftQuery};
use crate::systems::shop::{Buys, ShopBuys, ShopDef, ShopModule, ShopOffer, ShopReactions, Stock};
use crate::systems::text::plain;

const SIDED_WITH_ORCS: Condition = Expr::Query(RiftQuery::Memory {
    of: None,
    memory: MemoryId::SidedWithOrcs,
});
const NOT_SIDED_WITH_ORCS: Condition = Expr::Not(&SIDED_WITH_ORCS);

crate::table! {
    MaraWares: ShopDef {
        title: "Mara's Wares",
        mark: AttentionId::Merchant,
        modules: &[
            ShopModule::Sells(ShopOffer { item: ItemId::HealthPotion, count: 1, price: &[ItemStack::new(ItemId::Gold, 6)], stock: Stock::Unlimited, requires: None }),
            ShopModule::Sells(ShopOffer {
                item: ItemId::GreaterHealthPotion,
                count: 1,
                price: &[ItemStack::new(ItemId::Gold, 10), ItemStack::new(ItemId::BatWing, 2)],
                stock: Stock::Limited { count: 3, restock: Seconds(600.0) },
                requires: None,
            }),
            ShopModule::Sells(ShopOffer { item: ItemId::FishSteak, count: 2, price: &[ItemStack::new(ItemId::Gold, 5)], stock: Stock::Unlimited, requires: None }),
            ShopModule::Sells(ShopOffer {
                item: ItemId::BoneShield,
                count: 1,
                price: &[ItemStack::new(ItemId::Gold, 25)],
                stock: Stock::Limited { count: 1, restock: Seconds(3600.0) },
                requires: Some(&NOT_SIDED_WITH_ORCS),
            }),
            ShopModule::Buys(ShopBuys {
                what: Buys::Item(ItemId::OrcTusk),
                pays: &[ItemStack::new(ItemId::Gold, 1)],
                requires: Some(&NOT_SIDED_WITH_ORCS),
            }),
            ShopModule::Buys(ShopBuys { what: Buys::Category(ItemCategory::Consumable), pays: &[ItemStack::new(ItemId::Gold, 2)], requires: None }),
            ShopModule::Buys(ShopBuys { what: Buys::Category(ItemCategory::Equipment), pays: &[ItemStack::new(ItemId::Gold, 6)], requires: None }),
            ShopModule::Buys(ShopBuys { what: Buys::Category(ItemCategory::Material), pays: &[ItemStack::new(ItemId::Gold, 1)], requires: None }),
            ShopModule::Reactions(ShopReactions {
                bought: &[
                    Line { by: Npc(NpcId::Mara), face: Some(Generic(Happy)), text: &[plain("A fine choice. You won't find better this side of the strait.")] },
                    Line { by: Npc(NpcId::Mara), face: Some(Individual(ExpressionId::MaraCounting)), text: &[plain("Pleasure doing business.")] },
                ],
                sold: &[
                    Line { by: Npc(NpcId::Mara), face: Some(Generic(Thinking)), text: &[plain("Hm. I'll find a buyer for that.")] },
                    Line { by: Npc(NpcId::Mara), face: Some(Individual(ExpressionId::MaraSmug)), text: &[plain("It'll do. Don't tell anyone what I paid.")] },
                ],
                cant_afford: &[
                    Line { by: Npc(NpcId::Mara), face: Some(Generic(Angry)), text: &[plain("Come back when your purse is heavier.")] },
                ],
            }),
        ],
    },
    BoneExchange: ShopDef {
        title: "Bone Exchange",
        mark: AttentionId::Collector,
        modules: &[
            ShopModule::Sells(ShopOffer { item: ItemId::GreaterHealthPotion, count: 1, price: &[ItemStack::new(ItemId::BoneToken, 3)], stock: Stock::Unlimited, requires: None }),
            ShopModule::Sells(ShopOffer {
                item: ItemId::TribalHelmet,
                count: 1,
                price: &[ItemStack::new(ItemId::BoneToken, 12), ItemStack::new(ItemId::Gold, 20)],
                stock: Stock::Limited { count: 1, restock: Seconds(3600.0) },
                requires: None,
            }),
            ShopModule::Buys(ShopBuys { what: Buys::Item(ItemId::Bone), pays: &[ItemStack::new(ItemId::BoneToken, 1)], requires: None }),
            ShopModule::Buys(ShopBuys { what: Buys::Item(ItemId::BatWing), pays: &[ItemStack::new(ItemId::BoneToken, 1)], requires: None }),
        ],
    },
    HonestyBox: ShopDef {
        title: "Tobb's honesty box",
        mark: AttentionId::Merchant,
        modules: &[
            ShopModule::Sells(ShopOffer {
                item: ItemId::FishSteak,
                count: 1,
                price: &[ItemStack::new(ItemId::Gold, 3)],
                stock: Stock::Limited { count: 5, restock: Seconds(1800.0) },
                requires: None,
            }),
        ],
    },
    UgraRemedies: ShopDef {
        title: "Clan remedies",
        mark: AttentionId::Merchant,
        modules: &[
            ShopModule::Sells(ShopOffer {
                item: ItemId::GreaterHealthPotion,
                count: 1,
                price: &[ItemStack::new(ItemId::Bone, 4), ItemStack::new(ItemId::BatWing, 2)],
                stock: Stock::Unlimited,
                requires: None,
            }),
            ShopModule::Sells(ShopOffer {
                item: ItemId::TribalHelmet,
                count: 1,
                price: &[ItemStack::new(ItemId::OrcTusk, 8)],
                stock: Stock::Limited { count: 1, restock: Seconds(3600.0) },
                requires: None,
            }),
            ShopModule::Buys(ShopBuys { what: Buys::Item(ItemId::OrcTusk), pays: &[ItemStack::new(ItemId::Gold, 2)], requires: None }),
        ],
    },
}
