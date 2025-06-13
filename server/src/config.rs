use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub auth: AuthConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub bind_address: String,
    pub port: u16,
    pub public_dir: String,
    pub cors_origin: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub keycloak_url: String,
    pub realm: String,
    pub client_id: String,
}

impl AppConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();

        let server_port: u16 = env::var("MP_SERVER_PORT")
            .unwrap_or_else(|_| "3000".to_string())
            .parse()?;

        let bind_address = format!("0.0.0.0:{}", server_port);

        let config = AppConfig {
            server: ServerConfig {
                bind_address,
                port: server_port,
                public_dir: env::var("MP_SERVER_PUBLIC_DIR")
                    .unwrap_or_else(|_| "./public".to_string()),
                cors_origin: env::var("MP_CORS_ORIGIN")
                    .unwrap_or_else(|_| "*".to_string())
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .collect(),
            },
            database: DatabaseConfig {
                url: env::var("DATABASE_URL")?,
            },
            auth: AuthConfig {
                keycloak_url: env::var("KEYCLOAK_URL")?,
                realm: env::var("KEYCLOAK_REALM")?,
                client_id: env::var("KEYCLOAK_CLIENT_ID")?,
            },
        };

        Ok(config)
    }
}