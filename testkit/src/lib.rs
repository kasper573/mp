//! What the engine's tests stand on: a game of only the rows a test declares, loaded the way the
//! engine loads any game, and a bare world running only the systems a test names.

mod art;
mod bag;
mod game;
mod notices;
mod players;
mod sim;
mod talk;

pub use art::{png, wav};
pub use game::{Game, Map, settled_tables, stats};
pub use sim::{Sim, drawn_seed};
pub use talk::{labels, locked};
