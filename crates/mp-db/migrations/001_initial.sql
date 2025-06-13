-- Initial schema for the MP game
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Areas table
CREATE TABLE areas (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Actors table
CREATE TABLE actors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    actor_type VARCHAR(50) NOT NULL, -- 'character' or 'npc'
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    model_id VARCHAR(255),
    area_id VARCHAR(255) REFERENCES areas(id) ON DELETE CASCADE,
    position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
    health INTEGER NOT NULL DEFAULT 100,
    max_health INTEGER NOT NULL DEFAULT 100,
    level INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT actor_type_check CHECK (actor_type IN ('character', 'npc')),
    CONSTRAINT character_must_have_user CHECK (
        (actor_type = 'character' AND user_id IS NOT NULL) OR
        (actor_type = 'npc' AND user_id IS NULL)
    ),
    CONSTRAINT npc_must_have_model CHECK (
        (actor_type = 'npc' AND model_id IS NOT NULL) OR
        (actor_type = 'character')
    )
);

-- Create indexes for performance
CREATE INDEX idx_actors_area_id ON actors(area_id);
CREATE INDEX idx_actors_user_id ON actors(user_id);
CREATE INDEX idx_actors_type ON actors(actor_type);