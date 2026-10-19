/// The key content gives what a Rust identifier names, as serde's `snake_case` spells it:
/// `OldMan` is keyed `old_man`.
pub fn key_of(ident: &str) -> String {
    let mut key = String::with_capacity(ident.len() + 4);
    for (index, c) in ident.char_indices() {
        if c.is_ascii_uppercase() {
            if index > 0 {
                key.push('_');
            }
            key.push(c.to_ascii_lowercase());
        } else {
            key.push(c);
        }
    }
    key
}
