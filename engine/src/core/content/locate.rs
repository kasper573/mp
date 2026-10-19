use jsonc_parser::ast::Value;
use jsonc_parser::common::Ranged;
use jsonc_parser::{CollectOptions, ParseOptions, parse_to_ast};

/// Where each value and key of a JSON file sits, by JSON pointer.
pub struct JsonIndex {
    values: Vec<IndexedValue>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IndexedValue {
    pub pointer: String,
    pub line: usize,
    pub column: usize,
    pub string: Option<String>,
    pub key: bool,
}

impl JsonIndex {
    // Text that isn't JSON indexes nothing: its parse error carries a place of its own.
    pub fn of(text: &str) -> JsonIndex {
        let mut index = JsonIndex { values: Vec::new() };
        let parsed = parse_to_ast(text, &CollectOptions::default(), &strict_json());
        if let Some(value) = parsed.ok().and_then(|parsed| parsed.value) {
            index.visit(&value, String::new(), &Lines::of(text));
        }
        index
    }

    pub fn position(&self, pointer: &str) -> Option<(usize, usize)> {
        let mut wanted = pointer.to_owned();
        loop {
            if let Some(value) = self
                .values
                .iter()
                .find(|value| !value.key && value.pointer == wanted)
            {
                return Some((value.line, value.column));
            }
            let cut = wanted.rfind('/')?;
            wanted.truncate(cut);
        }
    }

    pub fn strings(&self) -> impl Iterator<Item = &IndexedValue> {
        self.values
            .iter()
            .filter(|value| !value.key && value.string.is_some())
    }

    fn visit(&mut self, value: &Value, pointer: String, lines: &Lines) {
        let (line, column) = lines.place(value.start());
        let string = match value {
            Value::StringLit(literal) => Some(literal.value.to_string()),
            _ => None,
        };
        self.values.push(IndexedValue {
            pointer: pointer.clone(),
            line,
            column,
            string,
            key: false,
        });
        match value {
            Value::Object(object) => {
                for property in &object.properties {
                    let name = property.name.as_str();
                    let inner = format!("{pointer}/{}", escape(name));
                    let (line, column) = lines.place(property.name.start());
                    self.values.push(IndexedValue {
                        pointer: inner.clone(),
                        line,
                        column,
                        string: Some(name.to_owned()),
                        key: true,
                    });
                    self.visit(&property.value, inner, lines);
                }
            }
            Value::Array(array) => {
                for (index, element) in array.elements.iter().enumerate() {
                    self.visit(element, format!("{pointer}/{index}"), lines);
                }
            }
            _ => {}
        }
    }
}

pub fn escape(segment: &str) -> String {
    segment.replace('~', "~0").replace('/', "~1")
}

pub fn unescape(segment: &str) -> String {
    segment.replace("~1", "/").replace("~0", "~")
}

fn strict_json() -> ParseOptions {
    ParseOptions {
        allow_comments: false,
        allow_loose_object_property_names: false,
        allow_trailing_commas: false,
        allow_missing_commas: false,
        allow_single_quoted_strings: false,
        allow_hexadecimal_numbers: false,
        allow_unary_plus_numbers: false,
        allow_bare_decimal_point_numbers: false,
        allow_non_finite_numbers: false,
        allow_extended_string_escapes: false,
    }
}

struct Lines<'a> {
    text: &'a str,
    starts: Vec<usize>,
}

impl<'a> Lines<'a> {
    fn of(text: &'a str) -> Lines<'a> {
        let starts = std::iter::once(0)
            .chain(text.match_indices('\n').map(|(at, _)| at + 1))
            .collect();
        Lines { text, starts }
    }

    fn place(&self, offset: usize) -> (usize, usize) {
        let line = self.starts.partition_point(|&start| start <= offset);
        let column = self.text[self.starts[line - 1]..offset].chars().count() + 1;
        (line, column)
    }
}
