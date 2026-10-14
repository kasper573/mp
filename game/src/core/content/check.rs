use std::fmt::Display;

#[derive(Default)]
pub struct RowCheck {
    errors: Vec<RowError>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RowError {
    pub pointer: String,
    pub rule: &'static str,
    pub found: String,
    pub expected: String,
    pub nearest: Option<String>,
}

impl RowCheck {
    pub fn error(
        &mut self,
        pointer: impl Into<String>,
        rule: &'static str,
        found: impl Display,
        expected: impl Display,
    ) {
        self.nearest(pointer, rule, found, expected, None);
    }

    pub fn nearest(
        &mut self,
        pointer: impl Into<String>,
        rule: &'static str,
        found: impl Display,
        expected: impl Display,
        nearest: Option<String>,
    ) {
        self.errors.push(RowError {
            pointer: pointer.into(),
            rule,
            found: found.to_string(),
            expected: expected.to_string(),
            nearest,
        });
    }

    pub fn range<T: PartialOrd + Display + Copy>(
        &mut self,
        pointer: impl Into<String>,
        value: T,
        min: T,
        max: T,
        what: &str,
    ) {
        if value < min || value > max {
            self.error(
                pointer,
                "out of range",
                value,
                format!("{what} {min} to {max}"),
            );
        }
    }

    pub fn text(&mut self, pointer: impl Into<String>, text: &str, min: usize, max: usize) {
        let length = text.chars().count();
        if text.trim().is_empty() || length < min || length > max {
            self.error(
                pointer,
                "out of range",
                format!("{text:?}"),
                format!("{min} to {max} characters, not blank"),
            );
        }
    }

    pub fn count(
        &mut self,
        pointer: impl Into<String>,
        count: usize,
        min: usize,
        max: usize,
        what: &str,
    ) {
        if count < min || count > max {
            self.error(
                pointer,
                "out of range",
                format!("{count} {what}"),
                format!("{min} to {max} {what}"),
            );
        }
    }

    pub fn into_errors(self) -> Vec<RowError> {
        self.errors
    }

    pub fn is_empty(&self) -> bool {
        self.errors.is_empty()
    }
}
