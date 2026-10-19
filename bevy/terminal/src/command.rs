use bevy_ecs::prelude::*;

use crate::terminal::{reply, reply_failure};

#[derive(Clone, Copy)]
pub struct TerminalCommand {
    pub name: &'static str,
    pub description: &'static str,
    pub run: fn(&mut World, &CommandCtx) -> Result<String, String>,
}

pub struct CommandCtx {
    pub conn: Entity,
    pub args: String,
}

pub(crate) fn run(world: &mut World, conn: Entity, line: &str) {
    let (name, args) = line.split_once(char::is_whitespace).unwrap_or((line, ""));
    let command = world
        .resource::<TerminalCommands>()
        .0
        .iter()
        .find(|command| command.name == name)
        .copied();
    let outcome = match command {
        Some(command) => (command.run)(
            world,
            &CommandCtx {
                conn,
                args: args.to_owned(),
            },
        ),
        None => Err(format!("Unknown command /{name} — try /commands")),
    };
    match outcome {
        Ok(text) if text.is_empty() => {}
        Ok(text) => reply(world, conn, text),
        Err(failure) => reply_failure(world, conn, failure),
    }
}

#[derive(Resource)]
pub(crate) struct TerminalCommands(Vec<TerminalCommand>);

impl TerminalCommands {
    pub(crate) fn new(commands: &[TerminalCommand]) -> TerminalCommands {
        TerminalCommands(
            std::iter::once(LIST)
                .chain(commands.iter().copied())
                .collect(),
        )
    }
}

const LIST: TerminalCommand = TerminalCommand {
    name: "commands",
    description: "List the commands available to you.",
    run: list,
};

fn list(world: &mut World, _ctx: &CommandCtx) -> Result<String, String> {
    let mut lines: Vec<String> = world
        .resource::<TerminalCommands>()
        .0
        .iter()
        .map(|command| format!("/{} — {}", command.name, command.description))
        .collect();
    lines.sort();
    Ok(lines.join("\n"))
}
