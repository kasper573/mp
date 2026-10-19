use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use engine::core::content::id::LeafKind;
use engine::core::content::{ContentOwners, ContentRow, OWNER_FIELD, RowName, row_file, row_of};
use engine::systems::area::AreaDef;
use engine::systems::registry;

use crate::project::{ContentEdit, Project, ProjectFiles};
use crate::rows::owned_row;
use crate::usages::ContentUsages;

/// Where a folder's rows sit and who uses them, with owners that can be changed to try a move
/// out before it is made. Nothing here writes; `owner_lines` turns the result into an edit.
#[derive(Clone)]
pub struct ScopeMoves<'a> {
    files: &'a ProjectFiles,
    usages: &'a ContentUsages,
    owners: ContentOwners,
}

/// The rows that use a row, leaving out its own local rows and the rows that see every row.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RowUsers {
    pub rows: BTreeSet<RowName>,
    /// Whether the game's settings name it, which only a global row may be.
    pub settings: bool,
    /// How many rows that see every row name it; they keep working wherever it goes.
    pub seeing_all: usize,
}

/// Why a row can't become local to anything.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StaysGlobal {
    Fixture,
    Unused,
    Settings,
    Scattered(Vec<RowName>),
}

/// A use a move would leave out of reach: `file` names `target` at `pointer`.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct BrokenUse {
    pub file: String,
    pub pointer: String,
    pub target: RowName,
}

/// What making a row local to an owner does: the rows only it uses go along, local to it or to
/// one of them, and the rows it uses that others use too stay global.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LocalPlan {
    pub row: RowName,
    pub owner: RowName,
    pub along: Vec<(RowName, RowName)>,
    pub staying: Vec<(RowName, usize)>,
    pub seeing_all: usize,
}

/// One row gathering would make local, and to which owner.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Gathered {
    pub row: RowName,
    pub owner: RowName,
    /// Ticked rows are made local; areas are offered unticked, as the game keeps them global.
    pub ticked: bool,
}

impl<'a> ScopeMoves<'a> {
    pub fn of(project: &'a Project) -> ScopeMoves<'a> {
        ScopeMoves::new(&project.files, &project.usages)
    }

    pub fn new(files: &'a ProjectFiles, usages: &'a ContentUsages) -> ScopeMoves<'a> {
        ScopeMoves {
            files,
            usages,
            owners: (*files.owners()).clone(),
        }
    }

    pub fn owners(&self) -> &ContentOwners {
        &self.owners
    }

    pub fn owner(&self, row: &RowName) -> Option<&RowName> {
        self.owners.owner(&row.table, &row.key)
    }

    /// Tries a move out: from here on, `row` has `owner`.
    pub fn set(&mut self, row: &RowName, owner: Option<RowName>) {
        self.owners.set(row, owner);
    }

    pub fn users(&self, row: &RowName) -> RowUsers {
        let mut users = RowUsers::default();
        for usage in self.usages.of_row(&row.table, &row.key) {
            if usage.is_owner_line() {
                continue;
            }
            let Some((table, key)) = row_of(&usage.file) else {
                users.settings = true;
                continue;
            };
            let reader = RowName::new(table, key);
            if registry().sees_all_rows(table) {
                users.seeing_all += 1;
            } else if !self.holds(row, &reader) {
                users.rows.insert(reader);
            }
        }
        users
    }

    /// The nearest row every use of `row` sits inside: the owner it can become local to.
    pub fn home(&self, row: &RowName) -> Result<RowName, StaysGlobal> {
        if registry().is_fixture(row) {
            return Err(StaysGlobal::Fixture);
        }
        let users = self.users(row);
        if users.settings {
            return Err(StaysGlobal::Settings);
        }
        let Some(first) = users.rows.first() else {
            return Err(StaysGlobal::Unused);
        };
        let home = std::iter::once(first)
            .chain(self.owners.chain(&first.table, &first.key))
            .find(|candidate| users.rows.iter().all(|user| self.holds(candidate, user)))
            .cloned();
        home.ok_or_else(|| StaysGlobal::Scattered(users.rows.into_iter().collect()))
    }

    /// Every use, of or by the given rows and the rows local to them, that is out of reach.
    pub fn broken_uses(&self, rows: &[RowName]) -> Vec<BrokenUse> {
        let mut checked: Vec<RowName> = rows.to_vec();
        for row in rows {
            checked.extend(self.owners.held_within(row));
        }
        let mut broken = BTreeSet::new();
        for row in &checked {
            let file = row_file(&row.table, &row.key);
            for reference in self.usages.in_file(&file) {
                let LeafKind::Row(table) = reference.kind else {
                    continue;
                };
                if !self.reaches(Some(row), table, &reference.value) {
                    broken.insert(BrokenUse {
                        file: file.clone(),
                        pointer: reference.pointer.clone(),
                        target: RowName::new(table, &reference.value),
                    });
                }
            }
            for usage in self.usages.of_row(&row.table, &row.key) {
                if usage.is_owner_line() {
                    continue;
                }
                let reader = row_of(&usage.file).map(|(table, key)| RowName::new(table, key));
                if !self.reaches(reader.as_ref(), &row.table, &row.key) {
                    broken.insert(BrokenUse {
                        file: usage.file.clone(),
                        pointer: usage.pointer.clone(),
                        target: row.clone(),
                    });
                }
            }
        }
        broken.into_iter().collect()
    }

    /// Making `row` local to `owner`, with the rows that can go along: those only it, or rows
    /// going along with it, use. Rows in `kept` stay where they are.
    pub fn make_local(
        &self,
        row: &RowName,
        owner: &RowName,
        kept: &BTreeSet<RowName>,
    ) -> LocalPlan {
        let mut tried = self.clone();
        tried.set(row, Some(owner.clone()));
        let mut along: Vec<(RowName, RowName)> = Vec::new();
        loop {
            let moving: Vec<RowName> = std::iter::once(row.clone())
                .chain(along.iter().map(|(row, _)| row.clone()))
                .collect();
            let next = tried
                .used_by(&moving)
                .into_iter()
                .filter(|used| {
                    !kept.contains(used)
                        && used != row
                        && used.table != AreaDef::TABLE
                        && tried.owner(used).is_none()
                })
                .find_map(|used| {
                    let home = tried.home(&used).ok()?;
                    tried.holds(row, &home).then_some((used, home))
                });
            let Some((used, home)) = next else {
                break;
            };
            tried.set(&used, Some(home.clone()));
            along.push((used, home));
        }
        let moving: Vec<RowName> = std::iter::once(row.clone())
            .chain(along.iter().map(|(row, _)| row.clone()))
            .collect();
        let staying = tried
            .used_by(&moving)
            .into_iter()
            .filter(|used| tried.owner(used).is_none() && !registry().is_fixture(used))
            .filter(|used| used != row)
            .map(|used| {
                let others = tried.users(&used).rows.len();
                (used, others)
            })
            .collect();
        LocalPlan {
            row: row.clone(),
            owner: owner.clone(),
            along,
            staying,
            seeing_all: self.users(row).seeing_all,
        }
    }

    /// The local rows that must become global with `row`, because it or its local rows use them
    /// and a global row can't reach them. Rows in `kept` are left out, whatever that breaks.
    pub fn make_global(&self, row: &RowName, kept: &BTreeSet<RowName>) -> Vec<RowName> {
        let mut tried = self.clone();
        tried.set(row, None);
        let mut along: Vec<RowName> = Vec::new();
        loop {
            let moving: Vec<RowName> = std::iter::once(row.clone())
                .chain(along.iter().cloned())
                .collect();
            let next = tried
                .broken_uses(&moving)
                .into_iter()
                .map(|broken| broken.target)
                .find(|target| !kept.contains(target) && !along.contains(target));
            let Some(next) = next else {
                break;
            };
            tried.set(&next, None);
            along.push(next);
        }
        along
    }

    /// Why `row` can't move to `owner`: the uses the move would break, or a loop.
    pub fn move_to(&self, row: &RowName, owner: &RowName) -> Result<(), MoveRefusal> {
        if !self.files.contains(&row_file(&owner.table, &owner.key)) {
            return Err(MoveRefusal::NoSuchRow);
        }
        if self.holds(row, owner) {
            return Err(MoveRefusal::Inside);
        }
        if registry().is_fixture(row) {
            return Err(MoveRefusal::Fixture);
        }
        let mut tried = self.clone();
        tried.set(row, Some(owner.clone()));
        let broken = tried.broken_uses(std::slice::from_ref(row));
        if broken.is_empty() {
            Ok(())
        } else {
            Err(MoveRefusal::Breaks(broken))
        }
    }

    /// Every global row used from inside one row only, made local to the nearest such row, with
    /// rows nested in the rows they belong to. `ticks` overrides which rows go: every row but an
    /// area does by default, since the game keeps its areas global.
    pub fn gather(&self, ticks: &BTreeMap<RowName, bool>) -> Vec<Gathered> {
        let ticked = |row: &RowName| {
            ticks
                .get(row)
                .copied()
                .unwrap_or(row.table != AreaDef::TABLE)
        };
        let candidates: Vec<RowName> = registry()
            .table_names()
            .into_iter()
            .flat_map(|table| {
                self.files
                    .keys_of(table)
                    .map(move |key| RowName::new(table, key))
            })
            .filter(|row| self.owner(row).is_none() && !registry().is_fixture(row))
            .collect();
        let mut tried = self.clone();
        let mut gathered: BTreeMap<RowName, RowName> = BTreeMap::new();
        loop {
            let mut changed = false;
            for row in candidates.iter().filter(|row| ticked(row)) {
                let Ok(home) = tried.home(row) else {
                    continue;
                };
                if gathered.get(row) != Some(&home) {
                    tried.set(row, Some(home.clone()));
                    gathered.insert(row.clone(), home);
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }
        let unticked = candidates
            .iter()
            .filter(|row| !ticked(row))
            .filter_map(|row| {
                Some(Gathered {
                    row: row.clone(),
                    owner: tried.home(row).ok()?,
                    ticked: false,
                })
            })
            .collect::<Vec<_>>();
        gathered
            .into_iter()
            .map(|(row, owner)| Gathered {
                row,
                owner,
                ticked: true,
            })
            .chain(unticked)
            .collect()
    }

    /// Whether `inner` is `outer` or sits inside it, at any depth.
    pub fn holds(&self, outer: &RowName, inner: &RowName) -> bool {
        inner == outer
            || self
                .owners
                .chain(&inner.table, &inner.key)
                .any(|above| above == outer)
    }

    fn reaches(&self, reader: Option<&RowName>, table: &str, key: &str) -> bool {
        reader.is_some_and(|reader| registry().sees_all_rows(&reader.table))
            || self.owners.in_reach(reader, table, key)
    }

    /// The rows the given rows' files name.
    fn used_by(&self, rows: &[RowName]) -> BTreeSet<RowName> {
        rows.iter()
            .flat_map(|row| self.usages.in_file(&row_file(&row.table, &row.key)))
            .filter_map(|reference| match reference.kind {
                LeafKind::Row(table) => Some(RowName::new(table, &reference.value)),
                LeafKind::Asset => None,
            })
            .filter(|used| self.files.contains(&row_file(&used.table, &used.key)))
            .collect()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MoveRefusal {
    NoSuchRow,
    Inside,
    Fixture,
    Breaks(Vec<BrokenUse>),
}

impl fmt::Display for StaysGlobal {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            StaysGlobal::Fixture => write!(f, "fixtures are global: code names them"),
            StaysGlobal::Unused => write!(f, "nothing uses it, so there is no owner to give it"),
            StaysGlobal::Settings => write!(f, "the game's settings name it"),
            StaysGlobal::Scattered(users) => write!(
                f,
                "used by {}: a row can be local to one owner only",
                users
                    .iter()
                    .map(RowName::to_string)
                    .collect::<Vec<_>>()
                    .join(" · ")
            ),
        }
    }
}

impl fmt::Display for MoveRefusal {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            MoveRefusal::NoSuchRow => write!(f, "no such row"),
            MoveRefusal::Inside => write!(f, "a row can't be local to itself or its own content"),
            MoveRefusal::Fixture => write!(f, "fixtures are global: code names them"),
            MoveRefusal::Breaks(broken) => write!(
                f,
                "{} use{} would lose it",
                broken.len(),
                if broken.len() == 1 { "" } else { "s" }
            ),
        }
    }
}

/// Writes each row's owner line as given, or takes it off for `None`, into `edit`.
pub fn owner_lines(
    edit: &mut ContentEdit,
    files: &ProjectFiles,
    lines: &[(RowName, Option<RowName>)],
) {
    for (row, owner) in lines {
        let file = row_file(&row.table, &row.key);
        let Some(mut json) = edit.pending_json(files, &file) else {
            continue;
        };
        let json = match owner {
            Some(owner) => owned_row(owner, &json),
            None => {
                if let Some(fields) = json.as_object_mut() {
                    fields.remove(OWNER_FIELD);
                }
                json
            }
        };
        edit.write_json(file, &json);
    }
}
