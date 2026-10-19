use bevy_ecs::message::Message;
use bevy_ecs::prelude::*;
use bevy_replicon::prelude::FromClient;
use engine::core::content::Content;
use engine::systems::area::AreaDef;
use engine::systems::player::snapshot::JoinAs;
use engine::systems::player::{
    self, AreaDrawn, ClientId, JoinRequest, Players, SpawnPolicy, SpawnRules,
};
use engine::systems::{GameSettings, WorldArea, from_client};

use crate::Sim;

impl Sim {
    /// Makes this world the server of the area under `key`, ready for players of the game's
    /// settings to join it.
    pub fn serve(&mut self, key: &str) -> &mut Sim {
        let area = self.id::<AreaDef>(key);
        let settings = self
            .world
            .resource::<Content>()
            .built::<GameSettings>()
            .clone();
        let world = &mut self.world;
        world.insert_resource(settings);
        world.insert_resource(WorldArea(area));
        world.insert_resource(SpawnRules {
            policy: SpawnPolicy::Map,
            immortal: true,
        });
        self
    }

    /// A client connected, joined, and drew the area it arrived in, the way anyone joins: its
    /// character, ready to take commands.
    pub fn join(&mut self, client: u32) -> Entity {
        let conn = self.connect(client);
        self.enter(client, conn)
    }

    /// A client joined as a character it brought along, the way a server hands one over to
    /// another: that character.
    pub fn join_as(&mut self, client: u32, join_as: JoinAs) -> Entity {
        let conn = self.connect(client);
        self.world.entity_mut(conn).insert(join_as);
        self.enter(client, conn)
    }

    pub fn connect(&mut self, client: u32) -> Entity {
        self.world.spawn(ClientId(client)).id()
    }

    /// Lets clients send `M`, so a system answering it may run before any client has.
    pub fn accept<M: Message>(&mut self) -> &mut Sim {
        self.message::<FromClient<M>>()
    }

    /// Writes `message` as sent by the client on `conn`, for the system that answers it.
    pub fn send<M: Message>(&mut self, conn: Entity, message: M) {
        self.accept::<M>();
        from_client(&mut self.world, conn, message);
    }

    pub fn player(&self, client: u32) -> Entity {
        self.world.resource::<Players>().0[&ClientId(client)]
    }

    pub fn conn(&mut self, client: u32) -> Entity {
        let mut conns = self.world.query::<(Entity, &ClientId)>();
        conns
            .iter(&self.world)
            .find(|(_, id)| id.0 == client)
            .map(|(conn, _)| conn)
            .expect("a connected client")
    }

    fn enter(&mut self, client: u32, conn: Entity) -> Entity {
        self.send(conn, JoinRequest);
        player::join(&mut self.world);
        self.send(conn, AreaDrawn);
        player::arrival_holds(&mut self.world);
        self.player(client)
    }
}
