// src/config/database.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';
import config from './config.js';

/**
 * Database Configuration and Connection Manager
 * Handles SQLite database initialization, migrations, and connection pooling.
 * Implements safety measures for concurrent access and error recovery.
 */

class DatabaseManager {
    constructor() {
        this.db = null;
        this.dbPath = path.join(config.paths.root, 'data', 'cloudpanel.db');
        this.migrationPath = path.join(config.paths.root, 'migrations');
        this.isInitialized = false;
    }

    /**
     * Initializes the database connection and ensures required setup
     * Creates database file and directory if they don't exist
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Ensure data directory exists
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

            // Open database connection with WAL mode for better concurrency
            this.db = await open({
                filename: this.dbPath,
                driver: sqlite3.Database,
            });

            // Enable foreign keys and WAL mode
            await this.db.exec('PRAGMA foreign_keys = ON');
            await this.db.exec('PRAGMA journal_mode = WAL');
            
            // Set reasonable timeout and cache size
            await this.db.exec('PRAGMA busy_timeout = 5000');
            await this.db.exec('PRAGMA cache_size = -2000'); // 2MB cache

            // Run startup checks
            await this.runStartupChecks();
            
            this.isInitialized = true;
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw new Error('Failed to initialize database');
        }
    }

    /**
     * Runs essential database startup checks and optimizations
     */
    async runStartupChecks() {
        try {
            // Check database integrity
            const integrityCheck = await this.db.get('PRAGMA integrity_check');
            if (integrityCheck.integrity_check !== 'ok') {
                throw new Error('Database integrity check failed');
            }

            // Optimize database
            await this.db.exec('PRAGMA optimize');
            
            // Check if migrations table exists
            const migrationTableExists = await this.db.get(`
                SELECT name 
                FROM sqlite_master 
                WHERE type='table' AND name='doctrine_migration_versions'
            `);

            if (!migrationTableExists) {
                await this.createMigrationsTable();
            }
        } catch (error) {
            console.error('Database startup checks failed:', error);
            throw error;
        }
    }

    /**
     * Creates the migrations tracking table if it doesn't exist
     */
    async createMigrationsTable() {
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS doctrine_migration_versions (
                version VARCHAR(191) PRIMARY KEY,
                executed_at DATETIME,
                execution_time INTEGER
            )
        `);
    }

    /**
     * Runs database migrations to update schema
     */
    async runMigrations() {
        try {
            const migrations = await fs.readdir(this.migrationPath);
            const executedMigrations = await this.getExecutedMigrations();

            for (const migration of migrations) {
                if (!executedMigrations.includes(migration)) {
                    await this.executeMigration(migration);
                }
            }
        } catch (error) {
            console.error('Migration execution failed:', error);
            throw error;
        }
    }

    /**
     * Retrieves list of already executed migrations
     */
    async getExecutedMigrations() {
        const results = await this.db.all(
            'SELECT version FROM doctrine_migration_versions'
        );
        return results.map(row => row.version);
    }

    /**
     * Executes a single migration file
     */
    async executeMigration(migrationFile) {
        const startTime = Date.now();
        const migrationPath = path.join(this.migrationPath, migrationFile);
        
        try {
            const migration = await fs.readFile(migrationPath, 'utf8');
            await this.db.exec(migration);

            await this.db.run(`
                INSERT INTO doctrine_migration_versions (
                    version, executed_at, execution_time
                ) VALUES (?, datetime('now'), ?)
            `, [migrationFile, Date.now() - startTime]);

            console.log(`Migration ${migrationFile} executed successfully`);
        } catch (error) {
            console.error(`Migration ${migrationFile} failed:`, error);
            throw error;
        }
    }

    /**
     * Safely closes the database connection
     */
    async close() {
        if (this.db) {
            try {
                await this.db.close();
                this.isInitialized = false;
                console.log('Database connection closed');
            } catch (error) {
                console.error('Error closing database:', error);
                throw error;
            }
        }
    }

    /**
     * Wraps database operations in a transaction
     */
    async transaction(callback) {
        try {
            await this.db.exec('BEGIN TRANSACTION');
            const result = await callback(this.db);
            await this.db.exec('COMMIT');
            return result;
        } catch (error) {
            await this.db.exec('ROLLBACK');
            throw error;
        }
    }

    /**
     * Creates a backup of the database
     */
    async backup(backupPath) {
        try {
            // Ensure backup directory exists
            await fs.mkdir(path.dirname(backupPath), { recursive: true });

            // Create backup using SQLite backup API
            await this.db.exec(`VACUUM INTO '${backupPath}'`);
            
            console.log(`Database backed up to ${backupPath}`);
        } catch (error) {
            console.error('Database backup failed:', error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const databaseManager = new DatabaseManager();

export default databaseManager;

// Export commonly used database methods for convenience
export const db = {
    /**
     * Executes a SQL query with parameters
     */
    async run(sql, params = []) {
        await databaseManager.initialize();
        return databaseManager.db.run(sql, params);
    },

    /**
     * Fetches a single row from the database
     */
    async get(sql, params = []) {
        await databaseManager.initialize();
        return databaseManager.db.get(sql, params);
    },

    /**
     * Fetches all rows from the database
     */
    async all(sql, params = []) {
        await databaseManager.initialize();
        return databaseManager.db.all(sql, params);
    },

    /**
     * Executes a transaction
     */
    async transaction(callback) {
        await databaseManager.initialize();
        return databaseManager.transaction(callback);
    }
};