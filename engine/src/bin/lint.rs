use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::sync::Arc;

use cargo_metadata::MetadataCommand;
use engine::core::content::{FilesystemFolder, GAME_FILE, TABLES_DIR, write};
use engine::systems::{load_content, registry};
use syn::UseTree;
use syn::visit::{self, Visit};
use walkdir::{DirEntry, WalkDir};

fn main() {
    let metadata = MetadataCommand::new()
        .no_deps()
        .exec()
        .expect("run `cargo metadata`");

    let mut violations = Vec::new();
    let engine = metadata
        .packages
        .iter()
        .find(|pkg| pkg.name == env!("CARGO_PKG_NAME"))
        .expect("the lint's own package in the workspace");
    let src = engine
        .manifest_path
        .parent()
        .expect("a manifest has a parent directory")
        .as_std_path()
        .join("src");
    check_crate(&engine.name, &src, &mut violations);
    let root = metadata.workspace_root.as_std_path();
    let scratch = metadata.target_directory.as_std_path().join("lint");
    for game in SHIPPED_GAMES {
        check_shipped_game(game, &root.join(game), &scratch.join(game), &mut violations);
    }

    if violations.is_empty() {
        println!("lint: layering, content keys and shipped games OK");
        return;
    }
    for violation in &violations {
        eprintln!("{violation}");
    }
    eprintln!("\nlint: {} violation(s)", violations.len());
    std::process::exit(1);
}

fn check_crate(name: &str, src: &Path, out: &mut Vec<String>) {
    let files = WalkDir::new(src)
        .into_iter()
        .filter_map(Result::ok)
        .map(DirEntry::into_path)
        .filter(|path| path.extension().is_some_and(|ext| ext == "rs"));
    for file in files {
        let rel = file
            .strip_prefix(src)
            .unwrap_or(&file)
            .to_string_lossy()
            .replace('\\', "/");

        if rel.starts_with("core/") {
            for reference in core_to_systems(&file) {
                out.push(format!(
                    "[{name}] src/{rel}: `{reference}` — core may not depend on any systems layer"
                ));
            }
        }
        if !rel.starts_with("core/content/") {
            for (line, call) in content_keys(&file) {
                out.push(format!(
                    "[{name}] src/{rel}:{line}: `{call}` — code names content: use a fixture, or a setting in game.json"
                ));
            }
        }
    }
}

/// The game folders the repo ships: the example game, and the template the editor starts new games
/// from.
const SHIPPED_GAMES: &[&str] = &["example_game", "editor/templates/new_game"];

/// A shipped game loads as a whole game, and every row and grid in it reads exactly as the editor
/// writes it, so saving it in the editor changes only what was edited.
fn check_shipped_game(name: &str, folder: &Path, scratch: &Path, out: &mut Vec<String>) {
    let content = match load_content(Arc::new(FilesystemFolder(folder.to_path_buf())), "lint") {
        Ok(content) => content,
        Err(report) => {
            out.push(format!("[{name}] does not load:\n{report}"));
            return;
        }
    };
    if scratch.exists() {
        fs::remove_dir_all(scratch).expect("clear the lint's scratch folder");
    }
    let writer = write(registry(), content, scratch).expect("write the game to the scratch folder");
    let written: BTreeSet<String> = writer.written().iter().cloned().collect();
    let shipped = rows_and_grids(folder);
    for file in shipped.difference(&written) {
        out.push(format!(
            "[{name}] {file}: a file no row or grid is written to"
        ));
    }
    for file in written.intersection(&shipped) {
        let ours = fs::read(folder.join(file)).expect("a shipped file");
        let editors = fs::read(scratch.join(file)).expect("a written file");
        if ours != editors {
            out.push(format!(
                "[{name}] {file}: not as the editor writes it; see {}",
                scratch.join(file).display()
            ));
        }
    }
}

fn rows_and_grids(folder: &Path) -> BTreeSet<String> {
    let tables = WalkDir::new(folder.join(TABLES_DIR))
        .follow_links(true)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| {
            let relative = entry.path().strip_prefix(folder).unwrap_or(entry.path());
            relative.to_string_lossy().replace('\\', "/")
        });
    std::iter::once(GAME_FILE.to_owned())
        .chain(tables)
        .collect()
}

fn core_to_systems(file: &Path) -> BTreeSet<String> {
    let mut found = SystemsRefs::default();
    if let Ok(source) = fs::read_to_string(file)
        && let Ok(ast) = syn::parse_file(&source)
    {
        found.visit_file(&ast);
    }
    found.hits
}

#[derive(Default)]
struct SystemsRefs {
    hits: BTreeSet<String>,
}

impl<'ast> Visit<'ast> for SystemsRefs {
    fn visit_path(&mut self, path: &'ast syn::Path) {
        let segments: Vec<String> = path.segments.iter().map(|s| s.ident.to_string()).collect();
        if segments.len() >= 2 && segments[1] == "systems" {
            self.hits.insert(segments.join("::"));
        }
        visit::visit_path(self, path);
    }

    fn visit_use_tree(&mut self, tree: &'ast UseTree) {
        if let UseTree::Path(path) = tree
            && use_reaches_systems(&path.tree)
        {
            self.hits.insert(format!("use {}::systems::…", path.ident));
        }
        visit::visit_use_tree(self, tree);
    }
}

fn use_reaches_systems(tree: &UseTree) -> bool {
    match tree {
        UseTree::Path(path) => path.ident == "systems",
        UseTree::Name(name) => name.ident == "systems",
        UseTree::Rename(rename) => rename.ident == "systems",
        UseTree::Group(group) => group.items.iter().any(use_reaches_systems),
        UseTree::Glob(_) => false,
    }
}

fn content_keys(file: &Path) -> Vec<(usize, String)> {
    let mut found = KeyLookups::default();
    if let Ok(source) = fs::read_to_string(file)
        && let Ok(ast) = syn::parse_file(&source)
    {
        found.visit_file(&ast);
    }
    found.hits
}

const KEY_LOOKUPS: &[&str] = &["by_key", "id_of"];

#[derive(Default)]
struct KeyLookups {
    hits: Vec<(usize, String)>,
}

impl<'ast> Visit<'ast> for KeyLookups {
    fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
        if KEY_LOOKUPS.contains(&call.method.to_string().as_str())
            && let Some(key) = call.args.first().and_then(string_literal)
        {
            self.hits.push((
                call.method.span().start().line,
                format!("{}({key:?})", call.method),
            ));
        }
        visit::visit_expr_method_call(self, call);
    }

    fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
        if let syn::Expr::Path(path) = &*call.func
            && let Some(last) = path.path.segments.last()
            && KEY_LOOKUPS.contains(&last.ident.to_string().as_str())
            && let Some(key) = call.args.iter().find_map(string_literal)
        {
            self.hits.push((
                last.ident.span().start().line,
                format!("{}({key:?})", last.ident),
            ));
        }
        visit::visit_expr_call(self, call);
    }
}

fn string_literal(expr: &syn::Expr) -> Option<String> {
    let expr = match expr {
        syn::Expr::Reference(reference) => &*reference.expr,
        other => other,
    };
    match expr {
        syn::Expr::Lit(syn::ExprLit {
            lit: syn::Lit::Str(text),
            ..
        }) => Some(text.value()),
        _ => None,
    }
}
