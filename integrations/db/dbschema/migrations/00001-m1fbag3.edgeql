CREATE MIGRATION m1fbag3q5jxyhkj5cap5ilxiwg45lrjhjgd5tvafuuukx6wp7sa2bq
    ONTO initial
{
  CREATE SCALAR TYPE default::NpcType EXTENDING enum<static, patrol, pacifist, defensive, aggressive, protective>;
  CREATE TYPE default::ActorModel {
      CREATE REQUIRED PROPERTY modelId: std::str {
          CREATE CONSTRAINT std::exclusive;
          CREATE CONSTRAINT std::max_len_value(64);
      };
  };
  CREATE TYPE default::Area {
      CREATE REQUIRED PROPERTY areaId: std::str {
          CREATE CONSTRAINT std::exclusive;
          CREATE CONSTRAINT std::max_len_value(60);
      };
  };
  CREATE TYPE default::Inventory {
      CREATE REQUIRED PROPERTY inventoryId: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
  };
  CREATE TYPE default::Character {
      CREATE REQUIRED LINK modelId: default::ActorModel;
      CREATE REQUIRED LINK areaId: default::Area;
      CREATE REQUIRED LINK inventoryId: default::Inventory;
      CREATE REQUIRED PROPERTY attackDamage: std::float64;
      CREATE REQUIRED PROPERTY attackRange: std::float64;
      CREATE REQUIRED PROPERTY attackSpeed: std::float64;
      CREATE REQUIRED PROPERTY characterId: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE REQUIRED PROPERTY coords: std::json;
      CREATE REQUIRED PROPERTY health: std::float64;
      CREATE REQUIRED PROPERTY maxHealth: std::float64;
      CREATE REQUIRED PROPERTY name: std::str {
          CREATE CONSTRAINT std::max_len_value(64);
      };
      CREATE REQUIRED PROPERTY online: std::bool {
          SET default := false;
      };
      CREATE REQUIRED PROPERTY speed: std::float64;
      CREATE REQUIRED PROPERTY userId: std::uuid;
      CREATE REQUIRED PROPERTY xp: std::float64;
  };
  CREATE TYPE default::Npc {
      CREATE REQUIRED LINK modelId: default::ActorModel;
      CREATE REQUIRED PROPERTY aggroRange: std::float64;
      CREATE REQUIRED PROPERTY attackDamage: std::float64;
      CREATE REQUIRED PROPERTY attackRange: std::float64;
      CREATE REQUIRED PROPERTY attackSpeed: std::float64;
      CREATE REQUIRED PROPERTY maxHealth: std::float64;
      CREATE REQUIRED PROPERTY name: std::str {
          CREATE CONSTRAINT std::max_len_value(64);
      };
      CREATE REQUIRED PROPERTY npcId: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE REQUIRED PROPERTY npcType: default::NpcType;
      CREATE REQUIRED PROPERTY speed: std::int64;
  };
  CREATE TYPE default::NpcSpawn {
      CREATE REQUIRED LINK areaId: default::Area;
      CREATE REQUIRED LINK npcId: default::Npc;
      CREATE PROPERTY coords: std::json;
      CREATE REQUIRED PROPERTY count: std::int64;
      CREATE PROPERTY npcType: default::NpcType;
      CREATE PROPERTY patrol: std::json;
      CREATE PROPERTY randomRadius: std::int64;
      CREATE REQUIRED PROPERTY spawnId: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
  };
  CREATE ABSTRACT TYPE default::ItemDefinition {
      CREATE REQUIRED PROPERTY name: std::str {
          CREATE CONSTRAINT std::max_len_value(64);
      };
  };
  CREATE TYPE default::ConsumableDefinition EXTENDING default::ItemDefinition {
      CREATE REQUIRED PROPERTY definitionId: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE REQUIRED PROPERTY maxStackSize: std::int64;
  };
  CREATE TYPE default::EquipmentDefinition EXTENDING default::ItemDefinition {
      CREATE REQUIRED PROPERTY definitionId: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE REQUIRED PROPERTY maxDurability: std::int64;
  };
  CREATE TYPE default::NpcReward {
      CREATE LINK consumableItemId: default::ConsumableDefinition;
      CREATE LINK equipmentItemId: default::EquipmentDefinition;
      CREATE REQUIRED LINK npcId: default::Npc;
      CREATE PROPERTY itemAmount: std::int64;
      CREATE REQUIRED PROPERTY rewardId: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE PROPERTY xp: std::float64;
  };
  CREATE ABSTRACT TYPE default::ItemInstance {
      CREATE REQUIRED LINK inventoryId: default::Inventory;
  };
  CREATE TYPE default::ConsumableInstance EXTENDING default::ItemInstance {
      CREATE REQUIRED LINK definitionId: default::ConsumableDefinition;
      CREATE REQUIRED PROPERTY instanceId: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE REQUIRED PROPERTY stackSize: std::int64;
  };
  CREATE TYPE default::EquipmentInstance EXTENDING default::ItemInstance {
      CREATE REQUIRED LINK definitionId: default::EquipmentDefinition;
      CREATE REQUIRED PROPERTY durability: std::int64;
      CREATE REQUIRED PROPERTY instanceId: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
  };
};
