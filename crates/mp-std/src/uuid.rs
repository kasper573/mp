use uuid::Uuid;

/// Generate a new UUID v4
pub fn generate_uuid() -> Uuid {
    Uuid::new_v4()
}

/// Generate a UUID from a string
pub fn uuid_from_string(s: &str) -> Result<Uuid, uuid::Error> {
    Uuid::parse_str(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_uuid() {
        let uuid1 = generate_uuid();
        let uuid2 = generate_uuid();
        
        // UUIDs should be different
        assert_ne!(uuid1, uuid2);
        
        // Should be valid v4 UUIDs
        assert_eq!(uuid1.get_version(), Some(uuid::Version::Random));
        assert_eq!(uuid2.get_version(), Some(uuid::Version::Random));
    }

    #[test]
    fn test_uuid_from_string() {
        let uuid_str = "550e8400-e29b-41d4-a716-446655440000";
        let uuid = uuid_from_string(uuid_str).unwrap();
        assert_eq!(uuid.to_string(), uuid_str);
    }

    #[test]
    fn test_uuid_from_invalid_string() {
        let result = uuid_from_string("invalid-uuid");
        assert!(result.is_err());
    }
}