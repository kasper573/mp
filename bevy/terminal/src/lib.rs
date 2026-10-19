extern crate self as bevy_terminal;

mod command;
mod terminal;

pub use command::{
    CommandArg, CommandArgSpec, CommandArgs, CommandCtx, RestOfLine, TerminalCommand, dispatch,
    require_arg,
};
pub use terminal::{
    AvailableTerminals, LineTone, Terminal, TerminalAccess, TerminalEntry, TerminalInbox,
    TerminalInput, TerminalKey, TerminalLine, broadcast, ingest, register, reply, reply_failure,
};

pub use bevy_terminal_macros::command;

#[doc(hidden)]
pub mod macro_support {
    pub use bevy_ecs::world::World;
    pub use inventory;
}
