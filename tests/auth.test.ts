import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { auth, createUser, login, setup, type TestCtx } from "./helpers.js";

let t: TestCtx;
before(async () => { t = await setup(); await createUser(t, "Antony.Goiana", "admin", "Teste@Admin1"); });
after(async () => t.close());
const csrf = { "x-atlas-csrf": "1" };

test("login por usuário e por e-mail retorna access token e cookie HttpOnly", async () => {
  const a = await login(t, "Antony.Goiana", "Teste@Admin1");
  const b = await login(t, "antony.goiana@kingstar.test", "Teste@Admin1");
  assert.ok(a.token && b.token);
  const r = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { login: "antony.goiana", senha: "Teste@Admin1" } });
  const ck = String(r.headers["set-cookie"]);
  assert.match(ck, /HttpOnly/); assert.match(ck, /SameSite=Strict/); assert.match(ck, /Path=\/api\/v1\/auth/);
  assert.equal(r.json().usuario.grupo, "admin");
  assert.equal(r.json().senha_hash, undefined);
});
test("credenciais inválidas e usuário inexistente têm a mesma resposta", async () => {
  const r1 = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { login: "Antony.Goiana", senha: "errada" } });
  const r2 = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { login: "nao.existe", senha: "errada" } });
  assert.equal(r1.statusCode, 401); assert.equal(r2.statusCode, 401);
  assert.deepEqual(r1.json(), r2.json());
});
test("login com corpo inválido retorna 400", async () => {
  const r = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { login: "", extra: 1 } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().error.code, "VALIDATION_ERROR");
});
test("senha é armazenada com hash bcrypt", async () => {
  const row = await t.db.get<{ senha_hash: string }>("SELECT senha_hash FROM usuarios WHERE usuario_chave = ?", ["antony.goiana"]);
  assert.match(row!.senha_hash, /^\$2[aby]\$/); assert.notEqual(row!.senha_hash, "Teste@Admin1");
});
test("token ausente, inválido, expirado ou de outro emissor é recusado", async () => {
  assert.equal((await t.app.inject({ url: "/api/v1/auth/me" })).statusCode, 401);
  assert.equal((await t.app.inject({ url: "/api/v1/auth/me", headers: auth("abc.def.ghi") })).statusCode, 401);
  const u = await t.db.get<{ id: string }>("SELECT id FROM usuarios LIMIT 1");
  const expired = jwt.sign({ sub: u!.id, grp: "admin", typ: "access" }, t.env.JWT_SECRET, { expiresIn: -10, issuer: t.env.JWT_ISSUER });
  assert.equal((await t.app.inject({ url: "/api/v1/auth/me", headers: auth(expired) })).statusCode, 401);
  const forged = jwt.sign({ sub: u!.id, grp: "admin", typ: "access" }, "outro-segredo-qualquer-com-32-caracteres!!", { issuer: t.env.JWT_ISSUER });
  assert.equal((await t.app.inject({ url: "/api/v1/auth/me", headers: auth(forged) })).statusCode, 401);
});
test("o papel vem do banco, não do token", async () => {
  const v = await createUser(t, "Visu.Role", "visualizador");
  const tok = jwt.sign({ sub: v.id, grp: "admin", typ: "access" }, t.env.JWT_SECRET, { expiresIn: 60, issuer: t.env.JWT_ISSUER });
  const r = await t.app.inject({ url: "/api/v1/usuarios", headers: auth(tok) });
  assert.equal(r.statusCode, 403);
});
test("refresh rotaciona o token; reuso do antigo revoga a família inteira", async () => {
  const s = await login(t, "Antony.Goiana", "Teste@Admin1");
  const r1 = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: csrf, cookies: { atlas_rt: s.refresh } });
  assert.equal(r1.statusCode, 200); assert.ok(r1.json().accessToken);
  const novo = String(r1.headers["set-cookie"]).split(";")[0]!.split("=")[1]!;
  assert.notEqual(novo, s.refresh);
  const reuse = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: csrf, cookies: { atlas_rt: s.refresh } });
  assert.equal(reuse.statusCode, 401);
  const depois = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: csrf, cookies: { atlas_rt: novo } });
  assert.equal(depois.statusCode, 401, "token novo também foi revogado após reuso detectado");
});
test("refresh exige cabeçalho anti-CSRF e origem permitida", async () => {
  const s = await login(t, "Antony.Goiana", "Teste@Admin1");
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", cookies: { atlas_rt: s.refresh } })).statusCode, 403);
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: { ...csrf, origin: "https://malicioso.example" }, cookies: { atlas_rt: s.refresh } })).statusCode, 403);
});
test("logout invalida a sessão de renovação", async () => {
  const s = await login(t, "Antony.Goiana", "Teste@Admin1");
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: csrf, cookies: { atlas_rt: s.refresh } })).statusCode, 204);
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: csrf, cookies: { atlas_rt: s.refresh } })).statusCode, 401);
});
test("usuário desativado não acessa nem renova", async () => {
  const u = await createUser(t, "Oper.Inativo", "operador");
  const s = await login(t, "Oper.Inativo");
  const adm = await login(t, "Antony.Goiana", "Teste@Admin1");
  assert.equal((await t.app.inject({ method: "PATCH", url: `/api/v1/usuarios/${u.id}`, headers: auth(adm.token), payload: { ativo: false } })).statusCode, 200);
  assert.equal((await t.app.inject({ url: "/api/v1/auth/me", headers: auth(s.token) })).statusCode, 401);
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: csrf, cookies: { atlas_rt: s.refresh } })).statusCode, 401);
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { login: "Oper.Inativo", senha: "Senha@12345" } })).statusCode, 401);
});
test("cadastro público desativado; admin cadastra; operador não", async () => {
  const body = { email: "novo@kingstar.test", usuario: "Novo.U", senha: "Senha@12345", grupo: "admin" };
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/register", payload: body })).statusCode, 401);
  await createUser(t, "Oper.Reg", "operador");
  const op = await login(t, "Oper.Reg");
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/register", headers: auth(op.token), payload: body })).statusCode, 403);
  const adm = await login(t, "Antony.Goiana", "Teste@Admin1");
  const r = await t.app.inject({ method: "POST", url: "/api/v1/auth/register", headers: auth(adm.token), payload: body });
  assert.equal(r.statusCode, 201); assert.equal(r.json().usuario.grupo, "admin");
});
test("troca da própria senha exige a senha atual e encerra sessões", async () => {
  await createUser(t, "Troca.S", "operador");
  const s = await login(t, "Troca.S");
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/senha", headers: auth(s.token), payload: { senhaAtual: "errada", novaSenha: "Nova@12345" } })).statusCode, 401);
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/senha", headers: auth(s.token), payload: { senhaAtual: "Senha@12345", novaSenha: "Nova@12345" } })).statusCode, 204);
  assert.equal((await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: csrf, cookies: { atlas_rt: s.refresh } })).statusCode, 401);
  await login(t, "Troca.S", "Nova@12345");
});

test("cadastro público, quando habilitado, nunca concede privilégios", async () => {
  const t2 = await setup({ PUBLIC_REGISTER: "true" });
  try {
    const r = await t2.app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email: "x@kingstar.test", usuario: "Publico.X", senha: "Senha@12345", grupo: "admin" } });
    assert.equal(r.statusCode, 201); assert.equal(r.json().usuario.grupo, "visualizador");
  } finally { await t2.close(); }
});
test("limitação de tentativas de login retorna 429", async () => {
  const t3 = await setup({ AUTH_RATE_LIMIT_MAX: "3" });
  try {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await t3.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { login: "a", senha: "b" } })).statusCode);
    assert.deepEqual(codes.slice(0, 3), [401, 401, 401]); assert.equal(codes[4], 429);
  } finally { await t3.close(); }
});
