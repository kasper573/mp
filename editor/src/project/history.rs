use std::time::SystemTime;

use super::AreaCameraState;
use super::files::FileChange;

pub const MAX_STEPS: usize = 500;
pub const MAX_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone)]
pub struct EditStep {
    pub label: String,
    pub before: Vec<FileChange>,
    pub after: Vec<FileChange>,
    pub selection: RowSelection,
    pub camera: Option<AreaCameraState>,
    pub at: SystemTime,
}

pub const GAME: &str = "game";

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RowSelection {
    pub table: String,
    pub keys: Vec<String>,
    pub parts: Vec<String>,
}

impl RowSelection {
    pub fn rows(table: &str, keys: Vec<String>) -> RowSelection {
        RowSelection {
            table: table.to_owned(),
            keys,
            parts: Vec::new(),
        }
    }

    pub fn row(table: &str, key: &str) -> RowSelection {
        RowSelection::rows(table, vec![key.to_owned()])
    }

    pub fn parts(table: &str, key: &str, parts: Vec<String>) -> RowSelection {
        RowSelection {
            table: table.to_owned(),
            keys: vec![key.to_owned()],
            parts,
        }
    }

    pub fn game() -> RowSelection {
        RowSelection::row(GAME, GAME)
    }

    pub fn is_game(&self) -> bool {
        self.table == GAME
    }

    pub fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }
}

pub struct EditHistory {
    steps: Vec<EditStep>,
    applied: usize,
    saved: Option<usize>,
}

impl Default for EditHistory {
    fn default() -> Self {
        EditHistory {
            steps: Vec::new(),
            applied: 0,
            saved: Some(0),
        }
    }
}

impl EditHistory {
    pub fn push(&mut self, step: EditStep) {
        self.steps.truncate(self.applied);
        if self.saved.is_some_and(|at| at > self.applied) {
            self.saved = None;
        }
        self.steps.push(step);
        self.applied = self.steps.len();
        self.trim();
    }

    pub fn undo_step(&self) -> Option<&EditStep> {
        self.applied.checked_sub(1).map(|at| &self.steps[at])
    }

    pub fn redo_step(&self) -> Option<&EditStep> {
        self.steps.get(self.applied)
    }

    pub fn undone(&mut self) {
        self.applied = self.applied.saturating_sub(1);
    }

    pub fn redone(&mut self) {
        self.applied = (self.applied + 1).min(self.steps.len());
    }

    pub fn steps(&self) -> &[EditStep] {
        &self.steps
    }

    pub fn applied(&self) -> usize {
        self.applied
    }

    pub fn saved(&self) -> Option<usize> {
        self.saved
    }

    pub fn mark_saved(&mut self) {
        self.saved = Some(self.applied);
    }

    pub fn reset(&mut self) {
        *self = EditHistory::default();
    }

    /// Drops every step past `applied`, as when the files they made turned out not to load.
    pub fn rewind(&mut self, applied: usize) {
        let applied = applied.min(self.steps.len());
        self.steps.truncate(applied);
        self.applied = applied;
        self.saved = self.saved.filter(|at| *at <= applied);
    }

    pub fn merge_into_last(&mut self, label: &str, after: Vec<FileChange>) -> bool {
        if self.applied != self.steps.len() {
            return false;
        }
        let Some(last) = self.steps.last_mut() else {
            return false;
        };
        let recent = last
            .at
            .elapsed()
            .is_ok_and(|since| since.as_secs_f32() < 1.0);
        if last.label != label || !recent {
            return false;
        }
        for change in after {
            match last
                .after
                .iter_mut()
                .find(|known| known.file == change.file)
            {
                Some(known) => known.bytes = change.bytes,
                None => last.after.push(change),
            }
        }
        last.at = SystemTime::now();
        true
    }

    fn trim(&mut self) {
        while self.steps.len() > MAX_STEPS || (self.bytes() > MAX_BYTES && self.steps.len() > 1) {
            self.steps.remove(0);
            self.applied = self.applied.saturating_sub(1);
            self.saved = self.saved.and_then(|at| at.checked_sub(1));
        }
    }

    fn bytes(&self) -> usize {
        self.steps
            .iter()
            .flat_map(|step| step.before.iter().chain(step.after.iter()))
            .map(|change| change.bytes.as_ref().map_or(0, |bytes| bytes.len()))
            .sum()
    }
}
