use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub actors: std::collections::HashMap<Uuid, Actor>,
    pub areas: std::collections::HashMap<String, Area>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Actor {
    pub id: Uuid,
    pub name: String,
    pub actor_type: ActorType,
    pub position: Position,
    pub area_id: String,
    pub health: i32,
    pub max_health: i32,
    pub level: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActorType {
    Character { user_id: Uuid },
    Npc { model_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Area {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
}

impl GameState {
    pub fn new() -> Self {
        Self {
            actors: std::collections::HashMap::new(),
            areas: std::collections::HashMap::new(),
        }
    }

    pub fn add_actor(&mut self, actor: Actor) {
        self.actors.insert(actor.id, actor);
    }

    pub fn remove_actor(&mut self, actor_id: &Uuid) -> Option<Actor> {
        self.actors.remove(actor_id)
    }

    pub fn get_actors_in_area(&self, area_id: &str) -> Vec<&Actor> {
        self.actors
            .values()
            .filter(|actor| actor.area_id == area_id)
            .collect()
    }
}

impl Default for GameState {
    fn default() -> Self {
        Self::new()
    }
}