//! How numbers and lists read in a line of text.

use std::fmt::Display;

pub fn plural<N: PartialEq + From<u8>>(count: N) -> &'static str {
    if count == N::from(1) { "" } else { "s" }
}

/// `count` of `noun`, the noun in the plural unless there is one.
pub fn counted<N: Display + PartialEq + From<u8>>(count: N, noun: &str) -> String {
    let shown = count.to_string();
    format!("{shown} {noun}{}", plural(count))
}

pub fn article(word: &str) -> &'static str {
    if word.starts_with(['a', 'e', 'i', 'o', 'u']) {
        "an"
    } else {
        "a"
    }
}

pub fn join_and(items: &[String]) -> String {
    match items {
        [] => String::new(),
        [one] => one.clone(),
        [head @ .., last] => format!("{} and {last}", head.join(", ")),
    }
}

pub fn thousands(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

/// `number` with its sign, a plus for a gain and a typographic minus for a loss, to hundredths.
pub fn signed(number: f64) -> String {
    let magnitude = (number.abs() * 100.0).round() / 100.0;
    let sign = if number < 0.0 { '−' } else { '+' };
    format!("{sign}{magnitude}")
}

/// `text` cut to `max` characters, an ellipsis ending what was cut.
pub fn clip(text: &str, max: usize) -> String {
    let text = text.trim();
    if text.chars().count() <= max {
        return text.to_owned();
    }
    let mut out: String = text.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}
