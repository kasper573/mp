module default {
  # Actor Models
  type ActorModel {
    required property modelId -> str {
      constraint exclusive;
      constraint max_len_value(64);
    };
  }

  # Areas
  type Area {
    required property areaId -> str {
      constraint exclusive;
      constraint max_len_value(60);
    };
  }

  # Inventory
  type Inventory {
    required property inventoryId -> str {
      constraint exclusive;
    };
  }

  # Item Definitions
  abstract type ItemDefinition {
    required property name -> str {
      constraint max_len_value(64);
    };
  }

  type ConsumableDefinition extending ItemDefinition {
    required property definitionId -> str {
      constraint exclusive;
    };
    required property maxStackSize -> int64;
  }

  type EquipmentDefinition extending ItemDefinition {
    required property definitionId -> str {
      constraint exclusive;
    };
    required property maxDurability -> int64;
  }

  # Item Instances
  abstract type ItemInstance {
    required link inventoryId -> Inventory;
  }

  type ConsumableInstance extending ItemInstance {
    required property instanceId -> str {
      constraint exclusive;
    };
    required link definitionId -> ConsumableDefinition;
    required property stackSize -> int64;
  }

  type EquipmentInstance extending ItemInstance {
    required property instanceId -> str {
      constraint exclusive;
    };
    required link definitionId -> EquipmentDefinition;
    required property durability -> int64;
  }

  # Character
  type Character {
    required property characterId -> str {
      constraint exclusive;
    };
    required property coords -> json;
    required link areaId -> Area;
    required property speed -> float64;
    required property userId -> uuid;
    required property health -> float64;
    required property maxHealth -> float64;
    required property attackDamage -> float64;
    required property attackSpeed -> float64;
    required property attackRange -> float64;
    required link modelId -> ActorModel;
    required property name -> str {
      constraint max_len_value(64);
    };
    required property online -> bool {
      default := false;
    };
    required property xp -> float64;
    required link inventoryId -> Inventory;
  }

  # NPC
  scalar type NpcType extending enum<
    'static',
    'patrol',
    'pacifist',
    'defensive',
    'aggressive',
    'protective'
  >;

  type Npc {
    required property npcId -> str {
      constraint exclusive;
    };
    required property speed -> int64;
    required property maxHealth -> float64;
    required property attackDamage -> float64;
    required property attackSpeed -> float64;
    required property attackRange -> float64;
    required link modelId -> ActorModel;
    required property name -> str {
      constraint max_len_value(64);
    };
    required property npcType -> NpcType;
    required property aggroRange -> float64;
  }

  # NPC Reward
  type NpcReward {
    required property rewardId -> str {
      constraint exclusive;
    };
    required link npcId -> Npc;
    link consumableItemId -> ConsumableDefinition;
    link equipmentItemId -> EquipmentDefinition;
    property itemAmount -> int64;
    property xp -> float64;
  }

  # NPC Spawn
  type NpcSpawn {
    required property spawnId -> str {
      constraint exclusive;
    };
    required property count -> int64;
    required link areaId -> Area;
    required link npcId -> Npc;
    property coords -> json;
    property randomRadius -> int64;
    property patrol -> json;
    property npcType -> NpcType;
  }
}
