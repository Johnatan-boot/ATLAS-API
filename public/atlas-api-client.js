/* ATLAS — camada HTTP do frontend.
 * Substitui window.claude.use("db"/"user"/"assets") por chamadas à API Fastify (/api/v1),
 * preservando a interface que o frontend já usa (collection/doc, onSnapshot, add, set, update, delete, get).
 * Não há fallback silencioso para localStorage: sem API, as operações falham e o usuário é avisado. */
(function () {
  "use strict";
  const CFG = window.ATLAS_API || {};
  const BASE = (CFG.base || "/api/v1").replace(/\/$/, "");
  const POLL_MS = CFG.pollMs || 15000;

  const API = {
    token: null, user: null, refreshing: null,
    async raw(method, path, body, opts = {}) {
      const headers = { Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (this.token && !opts.noAuth) headers.Authorization = "Bearer " + this.token;
      if (opts.csrf) headers["X-Atlas-Csrf"] = "1";
      let res;
      try { res = await fetch(BASE + path, { method, headers, credentials: "same-origin", body: body === undefined ? undefined : JSON.stringify(body) }); }
      catch { const e = new Error("Sem conexão com o servidor ATLAS. Verifique a rede e tente novamente."); e.code = "network"; e.apiMessage = e.message; throw e; }
      if (res.status === 204) return null;
      let data = null; try { data = await res.json(); } catch { /* corpo vazio */ }
      if (!res.ok) {
        const err = (data && data.error) || {};
        const e = new Error(err.message || `Erro ${res.status}`);
        e.status = res.status; e.code = err.code || String(res.status); e.apiMessage = err.message || null; e.details = err.details;
        throw e;
      }
      return data;
    },
    /** Requisição autenticada; em 401 tenta renovar a sessão uma vez (refresh token em cookie HttpOnly). */
    async req(method, path, body) {
      try { return await this.raw(method, path, body); }
      catch (e) {
        if (e.status !== 401 || !this.token) throw e;
        if (!(await this.refresh())) { window.dispatchEvent(new CustomEvent("atlas:sessao-expirada")); throw e; }
        return this.raw(method, path, body);
      }
    },
    async refresh() {
      if (!this.refreshing) this.refreshing = this.raw("POST", "/auth/refresh", undefined, { csrf: true, noAuth: true })
        .then(r => { this.token = r.accessToken; this.user = r.usuario; return true; }).catch(() => false).finally(() => { this.refreshing = null; });
      return this.refreshing;
    },
    async login(login, senha) {
      const r = await this.raw("POST", "/auth/login", { login, senha }, { noAuth: true });
      this.token = r.accessToken; this.user = r.usuario; DB.kick();
      return r.usuario;
    },
    async logout() { try { await this.raw("POST", "/auth/logout", undefined, { csrf: true, noAuth: true }); } catch { /* ignora */ } this.token = null; this.user = null; DB.reset(); },
    /** Lê todas as páginas de uma listagem. */
    async all(path) {
      const out = []; let page = 1;
      for (;;) {
        const sep = path.includes("?") ? "&" : "?";
        const r = await this.req("GET", `${path}${sep}page=${page}&pageSize=1000`);
        out.push(...r.data);
        if (out.length >= r.total || !r.data.length) return out;
        page++;
      }
    },
  };

  /* Chaves usadas pelo frontend para os mapas de produtos e filiais (mesmas funções do app). */
  const keyId = k => "k" + Array.from(String(k)).map(c => (/[A-Za-z0-9_-]/.test(c) ? c : "~" + c.codePointAt(0).toString(16) + "~")).join("");
  const skuKey = v => String(v || "").trim().toUpperCase();
  const filKey = v => String(v || "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
  const lastAcao = d => (d && Array.isArray(d.historico) && d.historico.length ? d.historico[d.historico.length - 1].acao : undefined);

  const cache = { prodSku: new Map(), filId: new Map(), users: new Map(), names: new Map() };
  const docSnap = (id, data) => ({ id, exists: data != null, data: () => data });
  const colSnap = docs => ({ docs: docs.map(d => { const { id, ...rest } = d; return { id, data: () => rest }; }), size: docs.length, empty: !docs.length });

  /* Leitura por caminho (coleção ou documento). 403 = módulo não liberado ao grupo: devolve vazio, sem erro. */
  async function read(kind, path) {
    const safe = async (fn, empty) => { try { return await fn(); } catch (e) { if (e.status === 403) return empty; throw e; } };
    if (kind === "col") {
      if (path === "cotacoes" || path === "coletas" || path === "envios") return colSnap(await safe(() => API.all("/" + path), []));
      if (path === "catalogo") {
        const prods = await safe(() => API.all("/produtos"), []), itens = {};
        cache.prodSku.clear();
        prods.forEach(p => { const k = keyId(skuKey(p.sku)); cache.prodSku.set(k, p.sku); itens[k] = p; });
        return colSnap([{ id: "s00", itens }]);
      }
      throw new Error("Coleção não suportada: " + path);
    }
    if (path === "config/filiais") {
      const fs = await safe(() => API.all("/filiais"), []), itens = {};
      cache.filId.clear();
      fs.forEach(f => { const k = keyId(filKey(f.nome).toUpperCase()); cache.filId.set(k, f.id); itens[k] = f; });
      return docSnap(path, { itens });
    }
    if (path === "config/usuarios") {
      const itens = {};
      if (API.user && API.user.grupo === "admin") {
        (await API.all("/usuarios")).forEach(u => { itens[u.id] = u; cache.users.set(u.id, u); });
      } else {
        const r = await safe(() => API.req("GET", "/usuarios/nomes"), { data: [] });
        r.data.forEach(n => { itens[n.id] = { id: n.id, usuario: n.usuario, ativo: true }; });
        if (API.user) itens[API.user.id] = { ...API.user, ativo: true };
      }
      Object.values(itens).forEach(u => cache.names.set(u.id, u.usuario));
      return docSnap(path, { itens });
    }
    if (/^data\/users\/[^/]+\/notificacoes$/.test(path)) return docSnap(path, await safe(() => API.req("GET", "/notificacoes/leituras"), { lidas: {} }));
    const m = path.match(/^(cotacoes|coletas|envios)\/([^/]+)$/);
    if (m) { try { const r = await API.req("GET", `/${m[1]}/${m[2]}`); const { id, ...rest } = r.data; return docSnap(id, rest); } catch (e) { if (e.status === 404) return docSnap(m[2], null); throw e; } }
    if (/^catalogo\/s\d\d$/.test(path)) return docSnap(path, { itens: {} });
    throw new Error("Documento não suportado: " + path);
  }

  /* Escritas por caminho. */
  async function write(op, path, data) {
    const m = path.match(/^(cotacoes|coletas|envios)\/([^/]+)$/);
    if (m) {
      const url = `/${m[1]}/${m[2]}`;
      if (op === "delete") await API.req("DELETE", url);
      else { const body = { ...data }; const a = lastAcao(data); if (a && !body.acao && op === "set") body.acao = a; delete body.historico; await API.req(op === "set" ? "PUT" : "PATCH", url, body); }
      return DB.touch(m[1]);
    }
    if (/^catalogo\/s\d\d$/.test(path)) {
      const itens = (data && data.itens) || {}, lote = [];
      for (const [k, p] of Object.entries(itens)) {
        if (p === null) { const sku = cache.prodSku.get(k); if (sku) await API.req("DELETE", "/produtos/" + encodeURIComponent(sku)); }
        else lote.push({ sku: p.sku, descricao: p.descricao, grupo: p.grupo || "", familia: p.familia || "", fornecedor: p.fornecedor || "", valor: Number(p.valor), peso: p.peso == null ? null : Number(p.peso) });
      }
      if (lote.length) await API.req("POST", "/produtos/lote", { itens: lote, acao: lote.length > 1 ? "Importação de planilha" : (lastAcao(Object.values(itens).find(Boolean)) || "Edição") });
      return DB.touch("catalogo");
    }
    if (path === "config/filiais") {
      const itens = (data && data.itens) || {}, novos = [];
      for (const [k, f] of Object.entries(itens)) {
        const id = cache.filId.get(k);
        if (f === null) { if (id) await API.req("DELETE", "/filiais/" + id); continue; }
        if (id) await API.req("PATCH", "/filiais/" + id, { codigo: f.codigo || "", ativa: f.ativa !== false });
        else novos.push({ nome: f.nome, codigo: f.codigo || "", ativa: f.ativa !== false });
      }
      if (novos.length === 1) await API.req("POST", "/filiais", novos[0]);
      else if (novos.length > 1) await API.req("POST", "/filiais/lote", { itens: novos });
      return DB.touch("config/filiais");
    }
    if (path === "config/usuarios") {
      // Criação e senhas usam endpoints próprios (chamados pela tela de usuários); aqui ficam edição e exclusão.
      if (!API.user || API.user.grupo !== "admin") return;
      for (const [id, u] of Object.entries((data && data.itens) || {})) {
        if (u === null) { await API.req("DELETE", "/usuarios/" + id); continue; }
        const cur = cache.users.get(id); if (!cur) continue;
        const patch = {};
        ["email", "usuario", "grupo"].forEach(f => { if (u[f] !== undefined && u[f] !== cur[f]) patch[f] = u[f]; });
        if (u.ativo !== undefined && (u.ativo !== false) !== cur.ativo) patch.ativo = u.ativo !== false;
        if (Object.keys(patch).length) await API.req("PATCH", "/usuarios/" + id, patch);
      }
      return DB.touch("config/usuarios");
    }
    if (/^data\/users\/[^/]+\/notificacoes$/.test(path)) { await API.req("PUT", "/notificacoes/leituras", { lidas: (data && data.lidas) || {} }); return; }
    throw new Error("Escrita não suportada: " + path);
  }

  /* Assinaturas: carga inicial após o login, atualização periódica e imediata após cada escrita. */
  const subs = new Set();
  const DB = {
    timer: null,
    async run(s) {
      if (!API.token) return;
      try { s.cb(await read(s.kind, s.path)); }
      catch (e) { if (s.err) s.err(e); }
    },
    kick() { subs.forEach(s => this.run(s)); if (!this.timer) this.timer = setInterval(() => { if (API.token && !document.hidden) subs.forEach(s => this.run(s)); }, POLL_MS); },
    touch(prefix) { subs.forEach(s => { if (s.path === prefix || s.path.startsWith(prefix + "/") || prefix.startsWith(s.path + "/")) this.run(s); }); },
    reset() { clearInterval(this.timer); this.timer = null; },
    subscribe(kind, path, cb, err) { const s = { kind, path, cb, err }; subs.add(s); if (API.token) this.run(s); return () => subs.delete(s); },
  };
  const dbShim = {
    collection(name) {
      return {
        onSnapshot: (cb, err) => DB.subscribe("col", name, cb, err),
        add: async data => {
          const body = { ...data }; delete body.historico;
          const r = await API.req("POST", "/" + name, body);
          DB.touch(name);
          return { id: r.data.id };
        },
        get: () => read("col", name),
      };
    },
    doc(path) {
      return {
        onSnapshot: (cb, err) => DB.subscribe("doc", path, cb, err),
        get: () => read("doc", path),
        set: data => write("set", path, data),
        update: data => write("update", path, data),
        delete: () => write("delete", path),
      };
    },
  };
  const blobToDataURL = b => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(b); });
  window.ATLAS = { API, DB };
  window.claude = {
    async use(name) {
      if (name === "db") return dbShim;
      if (name === "user") return {
        id: async () => (API.user ? API.user.id : null),
        profiles: async ids => Object.fromEntries((ids || []).map(id => [id, { name: cache.names.get(id) || null }])),
      };
      // Imagens de rastreio: gravadas no próprio registro como data URL (validada e limitada pela API).
      if (name === "assets") return { upload: async blob => ({ id: await blobToDataURL(blob) }), delete: async () => {} };
      return null;
    },
  };
})();
