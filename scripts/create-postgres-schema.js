const fs = require("fs");
const path = require("path");

const source = path.join(process.cwd(), "prisma", "schema.prisma");
const target = path.join(process.cwd(), "prisma", "schema.postgres.prisma");
const schema = fs.readFileSync(source, "utf8").replace('provider = "sqlite"', 'provider = "postgresql"');

fs.writeFileSync(target, schema);
console.log(`Schema PostgreSQL gerado em ${target}`);
