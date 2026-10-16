pub mod widget;

use std::collections::{HashMap, VecDeque};

use bevy::prelude::*;
use bevy_terminal::{AvailableTerminals, Terminal, TerminalLine};
use serde::{Deserialize, Serialize};
use strum::{IntoStaticStr, VariantArray};

#[derive(
    Serialize,
    Deserialize,
    VariantArray,
    IntoStaticStr,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
)]
pub enum TerminalKind {
    Global,
}

impl TerminalKind {
    fn terminal(self) -> &'static Terminal {
        match self {
            TerminalKind::Global => &GLOBAL,
        }
    }
}

static GLOBAL: Terminal = Terminal { access: None };

pub fn register(app: &mut App) {
    bevy_terminal::register(
        app,
        TerminalKind::VARIANTS
            .iter()
            .map(|&kind| (kind, kind.terminal())),
    );
}

pub struct TerminalPlugin;

impl Plugin for TerminalPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Terminals>()
            .init_resource::<widget::TerminalView>()
            .add_systems(Update, receive);
    }
}

#[derive(Resource, Default)]
pub struct Terminals {
    pub tabs: Vec<TerminalKind>,
    lines: HashMap<TerminalKind, VecDeque<(u64, String)>>,
    next_seq: u64,
}

impl Terminals {
    pub fn lines(&self, terminal: TerminalKind) -> impl Iterator<Item = &(u64, String)> {
        self.lines.get(&terminal).into_iter().flatten()
    }
}

const MAX_LINES: usize = 200;

fn receive(
    mut available: MessageReader<AvailableTerminals<TerminalKind>>,
    mut lines: MessageReader<TerminalLine<TerminalKind>>,
    mut terminals: ResMut<Terminals>,
) {
    for message in available.read() {
        if terminals.tabs != message.terminals {
            terminals.tabs = message.terminals.clone();
        }
    }
    for line in lines.read() {
        let seq = terminals.next_seq;
        terminals.next_seq += 1;
        let log = terminals.lines.entry(line.terminal).or_default();
        log.push_back((seq, line.text.clone()));
        if log.len() > MAX_LINES {
            log.pop_front();
        }
    }
}
