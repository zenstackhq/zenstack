import { Pool } from 'pg';

const USERNAME = 'postgres';
const PASSWORD = 'abc123';

export async function createPostgresDb(db: string) {
    const pool = new Pool({ user: USERNAME, password: PASSWORD });
    await pool.query(`DROP DATABASE IF EXISTS "${db}";`);
    await pool.query(`CREATE DATABASE "${db}";`);
    return `postgresql://${USERNAME}:${PASSWORD}@localhost:5432/${db}`;
}

export async function dropPostgresDb(db: string) {
    const pool = new Pool({ user: USERNAME, password: PASSWORD });
    await pool.query(`DROP DATABASE IF EXISTS "${db}";`);
}
