use bevy_ecs::component::Component;
use strum::{AsRefStr, EnumString, VariantArray};

#[derive(Component, Clone, Debug, PartialEq, Eq)]
#[component(immutable)]
pub struct Identity {
    pub id: AccountId,
    pub name: String,
    pub roles: Vec<Role>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct AccountId(pub String);

impl Identity {
    pub fn has_role(&self, role: Role) -> bool {
        self.roles.contains(&role)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, VariantArray, AsRefStr, EnumString)]
pub enum Role {
    Spectate,
}

pub fn provisioning_conf() -> String {
    let mut out = String::new();
    for role in Role::VARIANTS {
        out.push_str(&format!("role {}\n", role.as_ref()));
    }
    for (group, roles) in GROUPS {
        let granted: Vec<&str> = roles.iter().map(|role| role.as_ref()).collect();
        out.push_str(&format!("group {group} = {}\n", granted.join(" ")));
    }
    out
}

const GROUPS: &[(&str, &[Role])] = &[("spectator", &[Role::Spectate])];
