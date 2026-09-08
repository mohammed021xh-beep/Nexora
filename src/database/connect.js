const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false
  },

  max: 10,
  min: 2,

  connectionTimeoutMillis: 10000,

  idleTimeoutMillis: 30000,

  maxLifetimeSeconds: 0,

  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL POOL ERROR:", err.message);
});

console.log("✅ تم تجهيز اتصال PostgreSQL Pool");

function convertSQL(sql) {
  let index = 0;

  return sql.replace(/\?/g, () => `$${++index}`);
}

const db = {

  async exec(sql) {
    return pool.query(convertSQL(sql));
  },

  async run(sql, params = [], callback) {
    try {
      const result = await pool.query(
        convertSQL(sql),
        params
      );

      if (callback) {
        callback(null, result);
      }

      return result;

    } catch (err) {

      console.error("❌ DB RUN ERROR:", err.message);

      if (callback) {
        callback(err);
        return;
      }

      throw err;
    }
  },

  async get(sql, params = [], callback) {
    try {

      const result = await pool.query(
        convertSQL(sql),
        params
      );

      const row = result.rows[0];

      if (callback) {
        callback(null, row);
      }

      return row;

    } catch (err) {

      console.error("❌ DB GET ERROR:", err.message);

      if (callback) {
        callback(err);
        return;
      }

      throw err;
    }
  },

  async all(sql, params = [], callback) {
    try {

      const result = await pool.query(
        convertSQL(sql),
        params
      );

      if (callback) {
        callback(null, result.rows);
      }

      return result.rows;

    } catch (err) {

      console.error("❌ DB ALL ERROR:", err.message);

      if (callback) {
        callback(err);
        return;
      }

      throw err;
    }
  },

  async close() {
    await pool.end();
  }

};

module.exports = db;
