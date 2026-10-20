"""Gera public/index.html (frontend ATLAS integrado à API) a partir do arquivo original ATLAS.html.
Cada alteração é localizada por um trecho exato; se algum trecho não for encontrado o script falha (nada é alterado silenciosamente).
Uso: python3 scripts/build-frontend.py <ATLAS.html> public/index.html"""
import sys, pathlib
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
s = src.read_text(encoding="utf-8")
def R(a, b):
    global s
    n = s.count(a)
    if n != 1: raise SystemExit(f"Trecho encontrado {n} vezes (esperado 1): {a[:80]!r}")
    s = s.replace(a, b, 1)

# 1) Configuração da API e cliente HTTP (antes do script principal)
R("</head>", '<script>window.ATLAS_API = { base: "/api/v1", pollMs: 15000 };</script>\n<script src="/atlas-api-client.js"></script>\n</head>')
# 2) Mensagens de erro da API chegam ao usuário
R("function writeErr(e) {\n  const c = e && e.code;", "function writeErr(e) {\n  if (e && e.apiMessage) return e.apiMessage;\n  const c = e && e.code;")
# 3) Login validado no servidor
R("    const u = findLogin(idt);\n", """    if (window.ATLAS) {
      try {
        const u = await ATLAS.API.login(idt, pw);
        lgFails = 0; $("#lgErr").hidden = true; $("#lgPw").value = "";
        startSession({ ...u, ativo: true }); initReadState();
      } catch (er) {
        return err(er.status === 429 ? "Muitas tentativas. Aguarde um minuto e tente novamente." : er.status === 401 ? "E-mail/usuário ou senha inválidos." : (er.apiMessage || "Não foi possível entrar agora. Tente novamente."));
      }
      return;
    }
    const u = findLogin(idt);
""")
# 4) Logout encerra a sessão no servidor; sessão expirada volta ao login
R("function logout(msg) {\n", "function logout(msg) {\n  if (window.ATLAS && curUser) ATLAS.API.logout();\n")
R("function applyNavPerms() {", 'window.addEventListener("atlas:sessao-expirada", () => { if (curUser) logout("Sua sessão expirou. Entre novamente."); });\nfunction applyNavPerms() {')
# 5) Usuários vêm da API; sem usuário base no navegador
R("function initUsers() {\n", 'function initUsers() {\n  if (window.ATLAS) { usersLoaded = true; $("#lgBtn").disabled = false; $("#lgBtn").textContent = "Entrar"; }\n')
R("if (!users.size) seedBaseAdmin();", "if (!users.size && !window.ATLAS) seedBaseAdmin();")
# 6) Cadastro de usuário: senha enviada à API (hash bcrypt no servidor)
R("      let rec;\n      if (u) rec = { ...u, email, usuario, grupo };", """      if (window.ATLAS && !u) {
        const pw = $("#um-pw").value; if (pw.length < 8) return bad("um-pw", "A senha deve ter pelo menos 8 caracteres.");
        try { await ATLAS.API.req("POST", "/usuarios", { email, usuario, senha: pw, grupo }); ATLAS.DB.touch("config/usuarios"); toast(`Usuário ${usuario} cadastrado.`); }
        catch (er) { toast(writeErr(er), true); return false; }
        return;
      }
      let rec;
      if (u) rec = { ...u, email, usuario, grupo };""")
# 7) Troca/redefinição de senha pela API
R("      const rec0 = users.get(u.id) || u;\n", """      if (window.ATLAS) {
        const npw = $("#pw-new").value; if (npw.length < 8) return bad("pw-new", "A senha deve ter pelo menos 8 caracteres.");
        if (npw !== $("#pw-rep").value) return bad("pw-rep", "As senhas não conferem.");
        try {
          if (self) { await ATLAS.API.req("POST", "/auth/senha", { senhaAtual: $("#pw-cur").value, novaSenha: npw }); setTimeout(() => logout("Senha alterada. Entre novamente com a nova senha."), 50); }
          else { await ATLAS.API.req("POST", `/usuarios/${u.id}/senha`, { novaSenha: npw }); toast("Senha atualizada."); }
        } catch (er) { if (self && er.status === 401) return bad("pw-cur", "Senha atual incorreta."); toast(writeErr(er), true); return false; }
        return;
      }
      const rec0 = users.get(u.id) || u;
""")
# 8) Remove o hash do usuário base do modo antigo (sem uso com a API; o primeiro admin é criado no servidor)
import re
s, n = re.subn(r'(const BASE_ADMIN = \{[^}]*?)salt: "[0-9a-f]+", hash: "[0-9a-f]+"', r'\1salt: "", hash: ""', s)
if n != 1: raise SystemExit("BASE_ADMIN não encontrado")
out.write_text(s, encoding="utf-8")
print(f"ok: {out} ({len(s)//1024} KB)")
