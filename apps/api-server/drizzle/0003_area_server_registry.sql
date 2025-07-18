CREATE TABLE area_server_registry (
    server_id TEXT PRIMARY KEY,
    info JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for area queries
CREATE INDEX idx_area_server_registry_areas ON area_server_registry USING GIN ((info->'areas'));