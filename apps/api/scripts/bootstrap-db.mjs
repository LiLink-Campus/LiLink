import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

async function main() {
  await client.connect();

  const existsResult = await client.query(
    `select to_regclass('"School"') is not null as exists;`,
  );

  if (existsResult.rows[0]?.exists) {
    const upgradeSqlPath = path.resolve(process.cwd(), "prisma/upgrade.sql");
    const upgradeSql = fs.readFileSync(upgradeSqlPath, "utf8");
    await client.query(upgradeSql);
    console.log("Database schema already exists. Upgrade script applied.");
    await client.end();
    return;
  }

  const sqlPath = path.resolve(process.cwd(), "prisma/bootstrap.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  await client.query(sql);
  const upgradeSqlPath = path.resolve(process.cwd(), "prisma/upgrade.sql");
  const upgradeSql = fs.readFileSync(upgradeSqlPath, "utf8");
  await client.query(upgradeSql);
  await client.end();
  console.log("Database bootstrap completed.");
}

main().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
