use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenClaims {
    pub sub: String,
    pub exp: usize,
    pub iat: usize,
    pub preferred_username: Option<String>,
    pub email: Option<String>,
    pub realm_access: Option<RealmAccess>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealmAccess {
    pub roles: Vec<String>,
}

pub struct AuthService {
    pub keycloak_url: String,
    pub realm: String,
    pub client_id: String,
}

impl AuthService {
    pub fn new(keycloak_url: String, realm: String, client_id: String) -> Self {
        Self {
            keycloak_url,
            realm,
            client_id,
        }
    }

    pub async fn verify_token(&self, token: &str) -> anyhow::Result<User> {
        // TODO: Implement JWT token verification with Keycloak
        // For now, return a placeholder user
        Ok(User {
            id: Uuid::new_v4(),
            username: "placeholder".to_string(),
            email: "placeholder@example.com".to_string(),
            roles: vec!["user".to_string()],
        })
    }
}