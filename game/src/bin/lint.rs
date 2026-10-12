use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use cargo_metadata::MetadataCommand;
use syn::UseTree;
use syn::visit::{self, Visit};

fn main() {
    let metadata = MetadataCommand::new()
        .no_deps()
        .exec()
        .expect("run `cargo metadata`");

    let mut violations = Vec::new();
    for pkg in &metadata.packages {
        if !opted_in(&pkg.metadata) {
            continue;
        }
        let src = pkg
            .manifest_path
            .parent()
            .expect("a manifest has a parent directory")
            .as_std_path()
            .join("src");
        check_crate(&pkg.name, &src, &mut violations);
    }

    if violations.is_empty() {
        println!("lint: layering and content keys OK");
        return;
    }
    for violation in &violations {
        eprintln!("{violation}");
    }
    eprintln!("\nlint: {} violation(s)", violations.len());
    std::process::exit(1);
}

fn opted_in(metadata: &serde_json::Value) -> bool {
    metadata
        .get("lint")
        .and_then(|lint| lint.get("game"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

fn check_crate(name: &str, src: &Path, out: &mut Vec<String>) {
    let mut files = Vec::new();
    collect_rs(src, &mut files);
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

fn collect_rs(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_rs(&path, out);
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            out.push(path);
        }
    }
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
