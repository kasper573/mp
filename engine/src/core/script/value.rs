use bevy_ecs::entity::Entity;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Value {
    Bool(bool),
    Int(i64),
    Num(f64),
    Text(String),
    Actor(Option<Entity>),
}

#[derive(JsonSchema, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ValueType {
    Boolean,
    Integer,
    Number,
    Text,
    Actor,
}

impl ValueType {
    pub fn accepts(self, given: ValueType) -> bool {
        match (self, given) {
            (ValueType::Number, ValueType::Integer) => true,
            _ => self == given,
        }
    }

    pub fn zero(self) -> Value {
        match self {
            ValueType::Boolean => Value::Bool(false),
            ValueType::Integer => Value::Int(0),
            ValueType::Number => Value::Num(0.0),
            ValueType::Text => Value::Text(String::new()),
            ValueType::Actor => Value::Actor(None),
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            ValueType::Boolean => "boolean",
            ValueType::Integer => "integer",
            ValueType::Number => "number",
            ValueType::Text => "text",
            ValueType::Actor => "actor",
        }
    }
}

impl Value {
    pub fn value_type(&self) -> ValueType {
        match self {
            Value::Bool(_) => ValueType::Boolean,
            Value::Int(_) => ValueType::Integer,
            Value::Num(_) => ValueType::Number,
            Value::Text(_) => ValueType::Text,
            Value::Actor(_) => ValueType::Actor,
        }
    }

    pub fn truthy(&self) -> bool {
        match self {
            Value::Bool(b) => *b,
            Value::Int(i) => *i != 0,
            Value::Num(n) => *n != 0.0,
            Value::Text(t) => !t.is_empty(),
            Value::Actor(a) => a.is_some(),
        }
    }

    pub fn as_int(&self) -> i64 {
        match self {
            Value::Bool(b) => i64::from(*b),
            Value::Int(i) => *i,
            Value::Num(n) => *n as i64,
            Value::Text(_) | Value::Actor(_) => 0,
        }
    }

    pub fn as_num(&self) -> f64 {
        match self {
            Value::Bool(b) => f64::from(u8::from(*b)),
            Value::Int(i) => *i as f64,
            Value::Num(n) => *n,
            Value::Text(_) | Value::Actor(_) => 0.0,
        }
    }

    pub fn as_actor(&self) -> Option<Entity> {
        match self {
            Value::Actor(actor) => *actor,
            _ => None,
        }
    }

    pub fn as_text(&self) -> String {
        match self {
            Value::Bool(b) => b.to_string(),
            Value::Int(i) => i.to_string(),
            Value::Num(n) => {
                let rounded = (n * 100.0).round() / 100.0;
                if rounded.fract() == 0.0 {
                    format!("{rounded:.0}")
                } else {
                    let text = format!("{rounded:.2}");
                    text.trim_end_matches('0').to_owned()
                }
            }
            Value::Text(t) => t.clone(),
            Value::Actor(a) => a.map(|a| format!("{a:?}")).unwrap_or_default(),
        }
    }

    pub fn widened(self, to: ValueType) -> Value {
        match (to, self) {
            (ValueType::Number, Value::Int(i)) => Value::Num(i as f64),
            (_, value) => value,
        }
    }
}
