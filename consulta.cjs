const mysql = require("mysql2/promise");
const e = process.env;
(async () => {
  const c = await mysql.createConnection({
    host: e.MYSQL_HOST, port: +(e.MYSQL_PORT || 3306),
    user: e.MYSQL_USER, password: e.MYSQL_PASSWORD,
    database: e.MYSQL_DATABASE });
  const [r] = await c.query("SELECT usuario, email, grupo, ativo FROM usuarios");
  console.table(r);
  await c.end();
})().catch(x => console.log("ERRO:", x.message));
