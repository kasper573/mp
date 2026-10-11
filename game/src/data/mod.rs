pub mod area;
pub mod attention;
pub mod babble;
pub mod babble_bank;
pub mod cursor;
pub mod expression;
pub mod font;
pub mod input;
pub mod interface_icon;
pub mod item;
pub mod job;
pub mod memory;
pub mod model;
pub mod notification;
pub mod npc;
pub mod player;
pub mod quest;
pub mod script;
pub mod sfx;
pub mod shop;

use crate::core::content::{Content, ContentBuilder};
use crate::core::math::Pos;
use crate::systems::{GameSettings, SpawnPlace};

pub fn settings() -> GameSettings {
    GameSettings {
        name: "Rift",
        spawn: SpawnPlace {
            area: area::Id::Island,
            at: Pos::new(39.0, 29.0),
        },
        player: player::Id::Adventurer,
        bench: area::Id::Island,
    }
}

pub fn build() -> Content {
    let mut tables = ContentBuilder::default();
    tables
        .table(area::rows())
        .table(attention::rows())
        .table(babble::rows())
        .table(babble_bank::rows())
        .table(cursor::rows())
        .table(expression::rows())
        .table(font::rows())
        .table(input::rows())
        .table(interface_icon::rows())
        .table(item::rows())
        .table(job::rows())
        .table(memory::rows())
        .table(model::rows())
        .table(notification::rows())
        .table(npc::rows())
        .table(player::rows())
        .table(quest::rows())
        .table(script::rows())
        .table(sfx::rows())
        .table(shop::rows());
    tables.build()
}
