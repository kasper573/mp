use sqlx::{Pool, Postgres, PgPool};
use uuid::Uuid;

pub struct Database {
    pool: PgPool,
}

impl Database {
    pub async fn connect(database_url: &str) -> anyhow::Result<Self> {
        let pool = PgPool::connect(database_url).await?;
        
        // Run migrations
        sqlx::migrate!("./migrations").run(&pool).await?;
        
        Ok(Self { pool })
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub async fn health_check(&self) -> anyhow::Result<()> {
        sqlx::query("SELECT 1")
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl Database {
    pub async fn get_user_by_id(&self, user_id: &Uuid) -> anyhow::Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, created_at, updated_at FROM users WHERE id = $1"
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(user)
    }

    pub async fn create_user(&self, username: &str, email: &str) -> anyhow::Result<User> {
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (id, username, email, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
            RETURNING id, username, email, created_at, updated_at
            "#
        )
        .bind(Uuid::new_v4())
        .bind(username)
        .bind(email)
        .fetch_one(&self.pool)
        .await?;

        Ok(user)
    }
}