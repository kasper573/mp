/// Assert that a value is present, similar to TypeScript's assert function
pub fn assert<T>(value: Option<T>, error_message: &str) -> Result<T, String> {
    value.ok_or_else(|| error_message.to_string())
}

/// Assert that a value is present and panic if not
pub fn assert_unwrap<T>(value: Option<T>, error_message: &str) -> T {
    value.unwrap_or_else(|| panic!("{}", error_message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assert_some() {
        let result = assert(Some(42), "Value should exist");
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn test_assert_none() {
        let result = assert(None::<i32>, "Value should exist");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Value should exist");
    }

    #[test]
    fn test_assert_unwrap_some() {
        let value = assert_unwrap(Some(42), "Value should exist");
        assert_eq!(value, 42);
    }

    #[test]
    #[should_panic(expected = "Value should exist")]
    fn test_assert_unwrap_none() {
        assert_unwrap(None::<i32>, "Value should exist");
    }
}