const XLSX = require("xlsx"), mysql = require("mysql2/promise"), fs = require("fs");
const sh = k => { let h = 0; for (const c of k) h = (h * 31 + c.codePointAt(0)) >>> 0; return "s" + String(h % 16).padStart(2, "0"); };
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
(async () => {
  const wb = XLSX.readFile(process.argv[2]);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const up = c => String(c).trim().toUpperCase();
  const hi = rows.findIndex(r => r.some(c => up(c) === "SKU"));
  const col = n => rows[hi].findIndex(c => up(c) === n);
  const [iS, iG, iF] = [col("SKU"), col("GRUPO"), col("FORNECEDOR")];
  const plan = new Map();
  for (const r of rows.slice(hi + 1)) { const s = String(r[iS]).trim(); if (s) plan.set(s.toUpperCase(), { sku: s, grupo: r[iG], fornecedor: r[iF] }); }
  const e = process.env;
  const c = await mysql.createConnection({ host: e.MYSQL_HOST, port: +(e.MYSQL_PORT || 3306), user: e.MYSQL_USER, password: e.MYSQL_PASSWORD, database: e.MYSQL_DATABASE });
  const [db] = await c.query("SELECT sku FROM produtos"); await c.end();
  const no = new Set(db.map(x => String(x.sku).toUpperCase()));
  const falta = [...plan.values()].filter(p => !no.has(p.sku.toUpperCase()));
  console.log("SKUs únicos na planilha:", plan.size, "| linhas na tabela produtos:", db.length, "| FALTANDO:", falta.length);
  if (falta.length) {
    const tot = cnt([...plan.values()], p => sh(p.sku.toUpperCase())), fl = cnt(falta, p => sh(p.sku.toUpperCase()));
    console.table(Object.keys(tot).sort().map(s => ({ lote: s, na_planilha: tot[s], faltando: fl[s] || 0 })));
    console.table(cnt(falta, p => p.grupo));
    fs.writeFileSync("faltantes.tsv", falta.map(p => [p.sku, p.grupo, p.fornecedor].join("\t")).join("\n"));
    console.log("Lista salva em faltantes.tsv");
  }
})().catch(x => console.log("ERRO:", x.code || "", x.message || x));
