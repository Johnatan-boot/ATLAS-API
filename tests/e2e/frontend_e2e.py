"""Teste ponta a ponta: navegador real (Chromium/Playwright) + API rodando + frontend servido pela API.
Pré-requisito: API em ATLAS_URL e administrador criado com ATLAS_ADMIN / ATLAS_ADMIN_SENHA.
Uso: ATLAS_URL=http://127.0.0.1:3333 ATLAS_ADMIN=Antony.Goiana ATLAS_ADMIN_SENHA='...' python3 tests/e2e/frontend_e2e.py"""
import asyncio, datetime, json, os, sys, urllib.error, urllib.request
from playwright.async_api import async_playwright
B = os.environ.get("ATLAS_URL", "http://127.0.0.1:3333")
ADM, ADM_PW = os.environ.get("ATLAS_ADMIN", "Antony.Goiana"), os.environ["ATLAS_ADMIN_SENHA"]
SHOTS = os.environ.get("ATLAS_SHOTS")
falhas = []
def check(nome, ok, info=""):
    print(("OK   " if ok else "FALHA"), nome, info)
    if not ok: falhas.append(nome)
def api(method, path, token=None, body=None):
    req = urllib.request.Request(B + "/api/v1" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r: return r.status, (json.loads(r.read() or b"null") if r.status != 204 else None)
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"null")

async def main():
    _, r = api("POST", "/auth/login", body={"login": ADM, "senha": ADM_PW}); tok = r["accessToken"]
    api("POST", "/filiais", tok, {"nome": "São Paulo", "codigo": "SP01"})
    api("PUT", "/produtos/CMP078", tok, {"descricao": "CMP MASTER KING GOLD DESERT", "valor": 508.69, "peso": 32.5})
    api("POST", "/usuarios", tok, {"email": "oper.e2e@kingstar.test", "usuario": "Oper.E2E", "senha": "Senha@123", "grupo": "operador"})
    api("POST", "/usuarios", tok, {"email": "visu.e2e@kingstar.test", "usuario": "Visu.E2E", "senha": "Senha@123", "grupo": "visualizador"})
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={"width": 1440, "height": 900})).new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        shot = (lambda n: pg.screenshot(path=os.path.join(SHOTS, n))) if SHOTS else (lambda n: asyncio.sleep(0))
        await pg.goto(B + "/"); await pg.wait_for_timeout(800)
        await pg.fill("#lgId", ADM); await pg.fill("#lgPw", "senha-errada"); await pg.click("#lgBtn"); await pg.wait_for_timeout(500)
        check("login com senha errada é recusado", "inválidos" in (await pg.text_content("#lgErr") or ""))
        await pg.fill("#lgPw", ADM_PW); await pg.click("#lgBtn"); await pg.wait_for_timeout(1500)
        check("login do administrador", await pg.text_content("#uGroup") == "Administrador")
        await shot("01_logado.png")
        # Nova cotação pela interface, com duas opções na Calculadora de frete
        await pg.click(".nav [data-view=nova]"); await pg.wait_for_timeout(400)
        for sel, v in [("#f-cliente", "10245"), ("#f-pedido", "PV-E2E-1"), ("#f-filial", "SP01"), ("#f-cidade", "Recife"), (".p-sku", "CMP078"), (".p-qtd", "2")]: await pg.fill(sel, v)
        await pg.dispatch_event(".p-sku", "change"); await pg.select_option("#f-uf", "PE"); await pg.dispatch_event("#f-filial", "blur")
        q = pg.locator("#qoList .qo-row")
        await q.nth(0).locator(".qo-tr").fill("Braspress"); await q.nth(0).locator(".qo-vf").fill("612"); await q.nth(0).locator(".qo-pz").fill("6")
        await pg.click("#qoAdd"); await q.nth(1).locator(".qo-tr").fill("Jamef"); await q.nth(1).locator(".qo-vf").fill("548,90"); await q.nth(1).locator(".qo-pz").fill("7")
        await pg.click("#saveBtn"); await pg.wait_for_timeout(1500)
        _, lst = api("GET", "/cotacoes", tok); c = [x for x in lst["data"] if x["pedido"] == "PV-E2E-1"]
        check("cotação criada pela tela e gravada na API", len(c) == 1)
        check("servidor escolheu a opção mais barata e calculou o pedido", c and c[0]["transportadora"] == "Jamef" and c[0]["valorPedido"] == 1017.38, c and str((c[0]["transportadora"], c[0]["valorPedido"])))
        check("histórico com autor e ação", c and c[0]["criadoPor"] and c[0]["historico"][-1]["acao"] == "Criação")
        # Acompanhar: entregar e observar
        await pg.click(".nav [data-view=acompanhar]"); await pg.wait_for_timeout(800)
        await pg.click("#list [data-a=deliver] >> nth=0"); await pg.wait_for_timeout(300); await pg.click("#mFoot .primary"); await pg.wait_for_timeout(1500)
        _, d = api("GET", "/cotacoes/" + c[0]["id"], tok)
        check("marcar como entregue grava no servidor", d["data"]["entregueEm"] and d["data"]["historico"][-1]["acao"] == "Marcada como entregue")
        await pg.click("#list [data-a=obs] >> nth=0"); await pg.wait_for_timeout(400)
        await pg.fill("#obsTxt", "Cliente pediu entrega pela manhã"); await pg.click("#obsAdd"); await pg.wait_for_timeout(1500)
        _, d = api("GET", "/cotacoes/" + c[0]["id"], tok)
        check("observação gravada com data do servidor", len(d["data"]["obs"]) == 1)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300); await shot("02_acompanhar.png")
        # Produto e usuário pela interface
        await pg.click(".nav [data-view=produtos]"); await pg.wait_for_timeout(600)
        await pg.click("#prNew"); await pg.fill("#pm-sku", "TRAV50"); await pg.fill("#pm-desc", "Travesseiro King Soft"); await pg.fill("#pm-valor", "59,90"); await pg.click("#mFoot .primary"); await pg.wait_for_timeout(1500)
        st, pr = api("GET", "/produtos/TRAV50", tok); check("produto criado pela tela", st == 200 and pr["data"]["valor"] == 59.9)
        await pg.click(".nav [data-view=usuarios]"); await pg.wait_for_timeout(1200)
        await pg.click("#usNew"); await pg.fill("#um-email", "novo.ui@kingstar.test"); await pg.fill("#um-user", "Novo.UI"); await pg.fill("#um-pw", "Senha@123"); await pg.click("#mFoot .primary"); await pg.wait_for_timeout(1500)
        _, us = api("GET", "/usuarios", tok); check("usuário criado pela tela (senha com hash no servidor)", any(u["usuario"] == "Novo.UI" for u in us["data"]))
        await shot("03_usuarios.png")
        # Envio Flex
        await pg.click(".nav [data-view=env-novo]"); await pg.wait_for_timeout(500)
        await pg.fill("#e-cliente", "30044"); await pg.fill("#e-pedido", "ML-E2E"); await pg.fill("#eProdList .p-sku", "CMP078"); await pg.dispatch_event("#eProdList .p-sku", "change"); await pg.fill("#eProdList .p-qtd", "1")
        await pg.click("#eTypes [data-t=flex]"); await pg.wait_for_timeout(200)
        await pg.fill("#e-ent", (datetime.date.today() + datetime.timedelta(days=2)).isoformat())
        await pg.click("#eSaveBtn"); await pg.wait_for_timeout(1500)
        _, en = api("GET", "/envios", tok); check("envio Flex criado pela tela", any(e["pedido"] == "ML-E2E" and e["tipo"] == "flex" and e["valorNF"] == 508.69 for e in en["data"]))
        # Sessão e permissões
        await pg.click("#uchip"); await pg.click("#uOut"); await pg.wait_for_timeout(600)
        check("sair bloqueia o sistema", await pg.evaluate("document.body.classList.contains('locked')"))
        await pg.fill("#lgId", "Oper.E2E"); await pg.fill("#lgPw", "Senha@123"); await pg.click("#lgBtn"); await pg.wait_for_timeout(1500)
        await pg.click(".nav [data-view=acompanhar]"); await pg.wait_for_timeout(800)
        check("operador não vê botões de excluir", await pg.eval_on_selector_all("#list [data-a=del]", "e=>e.filter(x=>x.offsetParent).length") == 0)
        await pg.reload(); await pg.wait_for_timeout(800)
        check("recarregar a página pede login", await pg.evaluate("document.body.classList.contains('locked')"))
        await pg.fill("#lgId", "visu.e2e@kingstar.test"); await pg.fill("#lgPw", "Senha@123"); await pg.click("#lgBtn"); await pg.wait_for_timeout(1800)
        vis = await pg.eval_on_selector_all(".nav button[data-view]", "e=>e.filter(x=>!x.hidden && x.offsetParent).map(x=>x.dataset.view)")
        check("visualizador vê só os acompanhamentos", vis == ["acompanhar", "env-acompanhar"], str(vis))
        check("visualizador lê as cotações da API", await pg.locator("#list .item").count() == 1)
        await shot("04_visualizador.png")
        check("nenhum erro de JavaScript", not errs, str(errs))
        await b.close()
    print(f"\n{'TODOS OS FLUXOS OK' if not falhas else f'{len(falhas)} FALHA(S)'}")
    sys.exit(1 if falhas else 0)
asyncio.run(main())
