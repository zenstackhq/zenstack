import { Pool } from 'pg';

const USERNAME = process.env.ZENSTACK_TEST_DB_USER || 'postgres';
const PASSWORD = process.env.ZENSTACK_TEST_DB_PASS || 'abc123';
const CONNECTION_DB = process.env.ZENSTACK_TEST_DB_NAME || 'postgres';
const HOST = process.env.ZENSTACK_TEST_DB_HOST || 'localhost';
const PORT = (process.env.ZENSTACK_TEST_DB_PORT ? parseInt(process.env.ZENSTACK_TEST_DB_PORT) : null) || 5432;

function connect() {
    return new Pool({ 
        user: USERNAME, 
        password: PASSWORD, 
        database: CONNECTION_DB,
        host: HOST,
        port: PORT
    });
}

export async function createPostgresDb(db: string) {
    const pool = connect();
    await pool.query(`DROP DATABASE IF EXISTS "${db}";`);
    await pool.query(`CREATE DATABASE "${db}";`);
    await pool.end();
    return `postgresql://${USERNAME}:${PASSWORD}@${HOST}:${PORT}/${db}`;
}

export async function dropPostgresDb(db: string) {
    const pool = connect();
    await pool.query(`DROP DATABASE IF EXISTS "${db}";`);
    await pool.end();
}
