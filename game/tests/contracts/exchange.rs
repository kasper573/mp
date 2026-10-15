use game::systems::item::effects::move_between;
use game::systems::item::{ExchangeRefusal, Inventory, ItemStack};

use testkit::{Sim, content, count, give, row, spawn_area};

#[test]
fn moving_items_onto_the_same_character_changes_nothing() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    give(&mut sim, player, row("Gold"), 10);

    let result = move_between(
        sim.world(),
        player,
        player,
        &[ItemStack::new(row("Gold"), 4)],
    );

    assert!(result.is_err());
    assert_eq!(count(&mut sim, player, row("Gold")), 10);
}

#[test]
fn a_hand_in_frees_the_slot_its_reward_needs() {
    let mut inventory = bag(
        2,
        &[
            ItemStack::new(row("OrcTusk"), 5),
            ItemStack::new(row("Bone"), 1),
        ],
    );

    let result = inventory.exchange(
        content(),
        &[ItemStack::new(row("OrcTusk"), 5)],
        &[ItemStack::new(row("RustySword"), 1)],
    );

    assert_eq!(result, Ok(()));
    assert_eq!(inventory.count(row("OrcTusk")), 0);
    assert_eq!(inventory.count(row("RustySword")), 1);
    assert_eq!(inventory.count(row("Bone")), 1);
}

#[test]
fn a_refused_exchange_changes_nothing() {
    let original = bag(
        2,
        &[
            ItemStack::new(row("Gold"), 10),
            ItemStack::new(row("Bone"), 1),
        ],
    );

    let mut short = original.clone();
    assert_eq!(
        short.exchange(content(), &[ItemStack::new(row("Gold"), 15)], &[]),
        Err(ExchangeRefusal::Missing(ItemStack::new(row("Gold"), 5)))
    );
    assert_eq!(short, original);

    let mut full = original.clone();
    assert_eq!(
        full.exchange(
            content(),
            &[ItemStack::new(row("Gold"), 1)],
            &[ItemStack::new(row("RustySword"), 1)]
        ),
        Err(ExchangeRefusal::NoRoom { slots: 1 })
    );
    assert_eq!(full, original);
}

#[test]
fn costs_of_the_same_item_add_up() {
    let mut inventory = bag(5, &[ItemStack::new(row("Gold"), 20)]);
    assert_eq!(
        inventory.exchange(
            content(),
            &[
                ItemStack::new(row("Gold"), 15),
                ItemStack::new(row("Gold"), 10)
            ],
            &[]
        ),
        Err(ExchangeRefusal::Missing(ItemStack::new(row("Gold"), 5)))
    );
}

#[test]
fn gold_stacks_without_limit_in_one_slot() {
    let mut inventory = bag(1, &[]);
    inventory
        .exchange(
            content(),
            &[],
            &[ItemStack::new(row("Gold"), u32::MAX - 10)],
        )
        .expect("gold fits");
    inventory
        .exchange(content(), &[], &[ItemStack::new(row("Gold"), 10)])
        .expect("gold still fits");
    assert_eq!(inventory.slots.len(), 1);
    assert_eq!(inventory.count(row("Gold")), u32::MAX);
}

#[test]
fn refusals_read_as_what_is_needed() {
    assert_eq!(
        ExchangeRefusal::NoRoom { slots: 1 }.describe(content()),
        "Needs 1 free slot"
    );
    assert_eq!(
        ExchangeRefusal::Missing(ItemStack::new(row("Gold"), 20)).describe(content()),
        "Needs 20 more Gold"
    );
}

#[test]
fn taking_up_to_stacks_takes_what_is_held_and_no_more() {
    let mut inventory = bag(
        3,
        &[
            ItemStack::new(row("OrcTusk"), 3),
            ItemStack::new(row("Bone"), 1),
        ],
    );

    inventory.take_up_to(&[
        ItemStack::new(row("OrcTusk"), 2),
        ItemStack::new(row("OrcTusk"), 2),
        ItemStack::new(row("Gold"), 5),
    ]);

    assert_eq!(inventory.count(row("OrcTusk")), 0);
    assert_eq!(inventory.count(row("Gold")), 0);
    assert_eq!(inventory.count(row("Bone")), 1);
}

fn bag(max: u32, slots: &[ItemStack]) -> Inventory {
    Inventory {
        slots: slots.to_vec(),
        max,
    }
}
