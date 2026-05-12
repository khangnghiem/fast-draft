-- PostgreSQL 18 initialization script for Hindsight
-- This runs automatically when the container first starts

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for trigram similarity search (optional but useful)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a dedicated user for Hindsight (if using different user)
-- DO NOT run if POSTGRES_USER is already 'hindsight'
-- CREATE USER hindsight_app WITH PASSWORD 'app-password';
-- GRANT ALL PRIVILEGES ON DATABASE hindsight TO hindsight_app;

-- Tune PostgreSQL for vector workloads
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '768MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET work_mem = '8MB';

-- Logging configuration
ALTER SYSTEM SET log_destination = 'stderr';
ALTER SYSTEM SET logging_collector = 'on';
ALTER SYSTEM SET log_directory = '/var/log/postgresql';
ALTER SYSTEM SET log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log';
ALTER SYSTEM SET log_min_messages = 'warning';

-- Reload configuration
SELECT pg_reload_conf();

-- Verify pgvector is installed
SELECT * FROM pg_extension WHERE extname = 'vector';
