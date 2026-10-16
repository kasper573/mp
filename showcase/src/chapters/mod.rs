mod chat;
mod combat;
mod come_back_later;
mod conversation;
mod deploy;
mod explore;
mod history;
mod many_players;
mod notifications;
mod quest_choices;
mod quests;
mod shops;
mod sign_in;
mod soundscape;
mod spectate;
mod townsfolk;
mod travel;
mod windows;

use crate::shoot::Shoot;

pub struct Chapter {
    // Names the chapter's video, and picks it on the command line.
    pub name: &'static str,
    pub title: &'static str,
    pub summary: &'static str,
    pub play: fn(&mut Shoot),
}

// In the showcase's order.
pub const CHAPTERS: &[Chapter] = &[
    sign_in::CHAPTER,
    explore::CHAPTER,
    soundscape::CHAPTER,
    combat::CHAPTER,
    windows::CHAPTER,
    chat::CHAPTER,
    travel::CHAPTER,
    spectate::CHAPTER,
    townsfolk::CHAPTER,
    conversation::CHAPTER,
    shops::CHAPTER,
    quests::CHAPTER,
    quest_choices::CHAPTER,
    notifications::CHAPTER,
    many_players::CHAPTER,
    history::CHAPTER,
    come_back_later::CHAPTER,
    deploy::CHAPTER,
];
