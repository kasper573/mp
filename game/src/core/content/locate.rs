/// Where every value of a JSON document starts, by JSON pointer, in document order.
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
    pub fn of(text: &str) -> JsonIndex {
        let mut scanner = Scanner {
            chars: text.chars().peekable(),
            line: 1,
            column: 1,
            path: Vec::new(),
            values: Vec::new(),
        };
        scanner.value();
        JsonIndex {
            values: scanner.values,
        }
    }

    /// The position of the value at `pointer`, or of the nearest ancestor present (a missing field
    /// lands at its object).
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
        self.values.iter().filter(|value| value.string.is_some())
    }
}

pub fn escape(segment: &str) -> String {
    segment.replace('~', "~0").replace('/', "~1")
}

enum Frame {
    Object { key: Option<String> },
    Array { index: usize },
}

struct Scanner<'a> {
    chars: std::iter::Peekable<std::str::Chars<'a>>,
    line: usize,
    column: usize,
    path: Vec<Frame>,
    values: Vec<IndexedValue>,
}

impl Scanner<'_> {
    fn pointer(&self) -> String {
        let mut pointer = String::new();
        for frame in &self.path {
            pointer.push('/');
            match frame {
                Frame::Object { key } => pointer.push_str(&escape(key.as_deref().unwrap_or(""))),
                Frame::Array { index } => pointer.push_str(&index.to_string()),
            }
        }
        pointer
    }

    fn bump(&mut self) -> Option<char> {
        let c = self.chars.next()?;
        if c == '\n' {
            self.line += 1;
            self.column = 1;
        } else {
            self.column += 1;
        }
        Some(c)
    }

    fn skip_space(&mut self) {
        while matches!(self.chars.peek(), Some(' ' | '\t' | '\n' | '\r')) {
            self.bump();
        }
    }

    fn value(&mut self) {
        self.skip_space();
        let (line, column) = (self.line, self.column);
        let pointer = self.pointer();
        match self.chars.peek().copied() {
            Some('{') => {
                self.record(pointer, line, column, None);
                self.bump();
                self.object();
            }
            Some('[') => {
                self.record(pointer, line, column, None);
                self.bump();
                self.array();
            }
            Some('"') => {
                let string = self.string();
                self.record(pointer, line, column, Some(string));
            }
            Some(_) => {
                self.record(pointer, line, column, None);
                while let Some(c) = self.chars.peek() {
                    if matches!(c, ',' | '}' | ']' | ' ' | '\t' | '\n' | '\r') {
                        break;
                    }
                    self.bump();
                }
            }
            None => {}
        }
    }

    fn object(&mut self) {
        loop {
            self.skip_space();
            match self.chars.peek().copied() {
                Some('}') => {
                    self.bump();
                    return;
                }
                Some('"') => {
                    let (line, column) = (self.line, self.column);
                    let key = self.string();
                    self.skip_space();
                    if self.chars.peek() == Some(&':') {
                        self.bump();
                    }
                    self.path.push(Frame::Object {
                        key: Some(key.clone()),
                    });
                    let pointer = self.pointer();
                    self.values.push(IndexedValue {
                        pointer,
                        line,
                        column,
                        string: Some(key),
                        key: true,
                    });
                    self.value();
                    self.path.pop();
                    self.skip_space();
                    if self.chars.peek() == Some(&',') {
                        self.bump();
                    }
                }
                Some(_) => {
                    self.bump();
                }
                None => return,
            }
        }
    }

    fn array(&mut self) {
        let mut index = 0;
        loop {
            self.skip_space();
            match self.chars.peek().copied() {
                Some(']') => {
                    self.bump();
                    return;
                }
                Some(',') => {
                    self.bump();
                }
                Some(_) => {
                    self.path.push(Frame::Array { index });
                    self.value();
                    self.path.pop();
                    index += 1;
                }
                None => return,
            }
        }
    }

    fn string(&mut self) -> String {
        let mut text = String::new();
        self.bump();
        while let Some(c) = self.bump() {
            match c {
                '"' => break,
                '\\' => match self.bump() {
                    Some('n') => text.push('\n'),
                    Some('t') => text.push('\t'),
                    Some('r') => text.push('\r'),
                    Some('b') => text.push('\u{8}'),
                    Some('f') => text.push('\u{c}'),
                    Some('u') => {
                        let mut code = String::new();
                        for _ in 0..4 {
                            if let Some(h) = self.bump() {
                                code.push(h);
                            }
                        }
                        if let Some(c) =
                            u32::from_str_radix(&code, 16).ok().and_then(char::from_u32)
                        {
                            text.push(c);
                        }
                    }
                    Some(other) => text.push(other),
                    None => break,
                },
                other => text.push(other),
            }
        }
        text
    }

    fn record(&mut self, pointer: String, line: usize, column: usize, string: Option<String>) {
        self.values.push(IndexedValue {
            pointer,
            line,
            column,
            string,
            key: false,
        });
    }
}
