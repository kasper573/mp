use std::time::SystemTime;

use super::files::Change;

pub const MAX_STEPS: usize = 500;
pub const MAX_BYTES: usize = 64 * 1024 * 1024;

/// One undoable gesture: the touched files before and after, and where the editor was looking.
#[derive(Clone)]
pub struct Step {
    pub label: String,
    pub before: Vec<Change>,
    pub after: Vec<Change>,
    pub selection: Selection,
    pub camera: Option<(String, [f32; 3])>,
    pub at: SystemTime,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Selection {
    pub table: String,
    pub keys: Vec<String>,
    pub parts: Vec<String>,
}

impl Selection {
    pub fn rows(table: &str, keys: Vec<String>) -> Selection {
        Selection {
            table: table.to_owned(),
            keys,
            parts: Vec::new(),
        }
    }

    pub fn row(table: &str, key: &str) -> Selection {
        Selection::rows(table, vec![key.to_owned()])
    }

    pub fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }
}

#[derive(Default)]
pub struct History {
    steps: Vec<Step>,
    applied: usize,
}

impl History {
    pub fn push(&mut self, step: Step) {
        self.steps.truncate(self.applied);
        self.steps.push(step);
        self.applied = self.steps.len();
        self.trim();
    }

    pub fn can_undo(&self) -> bool {
        self.applied > 0
    }

    pub fn can_redo(&self) -> bool {
        self.applied < self.steps.len()
    }

    pub fn undo_step(&self) -> Option<&Step> {
        self.applied.checked_sub(1).map(|at| &self.steps[at])
    }

    pub fn redo_step(&self) -> Option<&Step> {
        self.steps.get(self.applied)
    }

    pub fn undone(&mut self) {
        self.applied = self.applied.saturating_sub(1);
    }

    pub fn redone(&mut self) {
        self.applied = (self.applied + 1).min(self.steps.len());
    }

    pub fn steps(&self) -> &[Step] {
        &self.steps
    }

    pub fn applied(&self) -> usize {
        self.applied
    }

    pub fn clear(&mut self) {
        self.steps.clear();
        self.applied = 0;
    }

    /// Merges a repeat of the latest step's gesture into it when it came within a second.
    pub fn merge_into_last(&mut self, label: &str, after: Vec<Change>) -> bool {
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
        while self.steps.len() > MAX_STEPS || self.bytes() > MAX_BYTES && self.steps.len() > 1 {
            self.steps.remove(0);
            self.applied = self.applied.saturating_sub(1);
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
