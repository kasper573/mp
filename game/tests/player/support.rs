use std::collections::HashMap;
use std::sync::LazyLock;

use bevy_app::App;
use bevy_ecs::message::Message;
use bevy_ecs::prelude::*;
use bevy_replicon::prelude::{ClientId as Sender, FromClient, ServerState};
use bevy_state::prelude::NextState;
use bevy_time::TimeUpdateStrategy;
use game::core::content::{Content, ContentId, ContentRow, key_of};
use game::core::math::Rng;
use game::core::time::{UnixMillis, UtcHour, WallClock};
use game::systems::TICK_HZ;
use game::systems::player::snapshot::JoinAs;
use game::systems::player::{AreaDrawn, ClientId, Immortal, JoinRequest, Players};

pub const CLOCK: WallClock = WallClock {
    now: UnixMillis(1_000_000_000),
    reset: UtcHour::MIDNIGHT,
};

pub fn content() -> &'static Content {
    static CONTENT: LazyLock<Content> = LazyLock::new(|| {
        game::systems::load_content(
            std::sync::Arc::new(game::core::content::FilesystemFolder(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../content"),
            )),
            "cargo test failed",
        )
        .unwrap_or_else(|report| panic!("{report}"))
    });
    &CONTENT
}

pub fn row<Row: ContentRow>(name: &str) -> ContentId<Row> {
    content()
        .by_key::<Row>(key_of(name).as_str())
        .unwrap_or_else(|| panic!("no {} row named `{name}`", Row::TABLE))
}

pub struct Sim {
    pub app: App,
    conns: HashMap<u32, Entity>,
}

impl Sim {
    pub fn area(area: game::systems::area::Id) -> Sim {
        let mut app = game::systems::server_app(area, 0, CLOCK, content());
        app.insert_resource(Rng::new(1));
        app.insert_resource(Immortal(false));
        app.insert_resource(TimeUpdateStrategy::ManualDuration(TICK_HZ.period()));
        app.finish();
        app.cleanup();
        app.world_mut()
            .resource_mut::<NextState<ServerState>>()
            .set(ServerState::Running);
        app.update();
        Sim {
            app,
            conns: HashMap::new(),
        }
    }

    pub fn world(&mut self) -> &mut World {
        self.app.world_mut()
    }

    pub fn join_as(&mut self, client: u32, join_as: JoinAs) -> Entity {
        let conn = self.world().spawn((ClientId(client), join_as)).id();
        self.conns.insert(client, conn);
        self.send(client, JoinRequest);
        self.app.update();
        self.send(client, AreaDrawn);
        *self
            .world()
            .resource::<Players>()
            .0
            .get(&ClientId(client))
            .expect("joined player")
    }

    fn send<M: Message>(&mut self, client: u32, message: M) {
        let conn = self.conns[&client];
        self.world().write_message(FromClient {
            client_id: Sender::Client(conn),
            message,
        });
    }
}
