"""Converte o protótipo (FUNIL.html) no módulo Funil de Vendas servido pelo Dashboard.

- separa jsPDF, CSS e app em arquivos próprios (CSP script-src 'self', sem inline);
- fontes locais (sem Google Fonts);
- remove login/senha do frontend; API em /api/funil/* com a sessão do Dashboard;
- ponte de navegação com o Dashboard (postMessage, mesma origem).
"""
import os, re, shutil, sys

SRC = sys.argv[1]
OUT = sys.argv[2]
FONTS = sys.argv[3]

html = open(SRC, encoding='utf-8').read()
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(OUT, 'fonts'), exist_ok=True)

scripts = list(re.finditer(r'<script>(.*?)</script>', html, re.S))
assert len(scripts) == 2, len(scripts)
jspdf, app = scripts[0].group(1), scripts[1].group(1)
css_m = re.search(r'<style>(.*?)</style>', html, re.S)
css = css_m.group(1)
body_m = re.search(r'<body>(.*?)<script>', html, re.S)
body = body_m.group(1)

def must_replace(s, old, new, count=1):
    n = s.count(old)
    assert n == count, f'{old[:60]!r}: {n} ocorrências (esperado {count})'
    return s.replace(old, new)

# ---------------------------------------------------------------- app.js
app = must_replace(app, "const AUTH = { user: 'mlf', pass: '0080' };\nconst AUTH_STORAGE_KEY = 'clubn_auth_v1';\n",
                   "/* Login único: a sessão é a do Dashboard Financeiro (cookie HttpOnly). Nenhuma senha fica no navegador. */\n")
app = must_replace(app, """    try{ return storage.getItem(AUTH_STORAGE_KEY) === '1' ? 'dashboard' : 'login'; }
    catch(e){ return 'login'; }""", """    const v = (location.hash || '').replace('#','');
    return FUNIL_NAV_VIEWS.indexOf(v) > -1 ? v : 'dashboard';""")
app = must_replace(app, "let appState = {", """const FUNIL_NAV_VIEWS = ['dashboard','callForm','callsHistory','propostaForm','propostasList'];
let appState = {""")

# login / logout locais → sessão do Dashboard
app = re.sub(r"function checkLogin\(\)\{.*?\n\}\nfunction logout\(\)\{.*?\n\}\n",
             """function checkLogin(){ goToDashboard(); }
function logout(){
  try{ window.parent.postMessage({type:'funil:logout'}, location.origin); } catch(e){}
}
""", app, count=1, flags=re.S)
assert 'AUTH.' not in app and 'AUTH_STORAGE_KEY' not in app

# API protegida
app = must_replace(app, """    const res = await fetch(API_BASE + path, {
      method,
      headers""", """    const res = await fetch(API_BASE + path, {
      method,
      credentials: 'same-origin',
      headers""")
app = must_replace(app, "    if(!res.ok) throw new Error('HTTP ' + res.status);\n    apiIsAvailable = true;\n    return await res.json();",
                   "    if(res.status === 401 || res.status === 403){ sessionExpired(); return null; }\n    if(!res.ok) throw new Error('HTTP ' + res.status);\n    apiIsAvailable = true;\n    return await res.json();")
app = must_replace(app, "    const res = await fetch(API_BASE + '/api/bootstrap');\n    if(!res.ok) throw new Error('HTTP ' + res.status);",
                   "    const res = await fetch(API_BASE + '/api/funil/bootstrap', {credentials:'same-origin'});\n    if(res.status === 401 || res.status === 403){ sessionExpired(); return; }\n    if(!res.ok) throw new Error('HTTP ' + res.status);")
app = must_replace(app, "    _diagnosticosCache = data.diagnosticos || [];\n",
                   "    _diagnosticosCache = data.diagnosticos || [];\n    if(data.operator && data.operator.name) OPERATOR_NAME = data.operator.name;\n")
app = must_replace(app, "async function apiRequest(method, path, body){", """function sessionExpired(){
  /* sessão do Dashboard expirou: volta para o login (na janela principal) */
  try{ window.parent.postMessage({type:'funil:session-expired'}, location.origin); } catch(e){}
  try{ if(window.top === window) location.href = '/'; } catch(e){}
}
async function apiRequest(method, path, body){""")
for ent in ('diagnosticos', 'calls', 'propostas'):
    app = app.replace(f"'/api/{ent}'", f"'/api/funil/{ent}'").replace(f"'/api/{ent}/'", f"'/api/funil/{ent}/'")
assert re.search(r"'/api/(calls|propostas|diagnosticos)", app) is None

# nome do operador = usuário logado
app = must_replace(app, "const OPERATOR_NAME = 'Marcos';", "let OPERATOR_NAME = 'parceiro'; /* substituído pelo nome do usuário logado (Configurações → Seu nome) */")

# ponte com o Dashboard: menu "Funil de Vendas" ↔ telas do app
bridge = r"""
/* ---------------- Integração com o Dashboard Financeiro ----------------
   O menu "Funil de Vendas" do Dashboard navega por mensagem (mesma origem);
   o app avisa o Dashboard em qual tela está, para manter o menu sincronizado. */
const _renderFunil = render;
render = function(){
  document.body.setAttribute('data-view', appState.view);
  _renderFunil();
  try{ window.parent.postMessage({type:'funil:view', view: appState.view}, location.origin); } catch(e){}
};
function funilNavigate(view){
  if(FUNIL_NAV_VIEWS.indexOf(view) === -1) return;
  if(appState.view === view) { window.scrollTo({top:0}); return; }
  if(appState.view === 'wizard' && !confirm('Sair sem salvar este diagnóstico?')) {
    try{ window.parent.postMessage({type:'funil:view', view: appState.view}, location.origin); } catch(e){}
    return;
  }
  editingPropostaId = null;
  pendingPropostaTela1 = null;
  pendingPropostaTela2 = null;
  pendingPropostaTelaOferta = null;
  appState.view = view;
  render();
}
window.addEventListener('message', function(e){
  if(e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
  if(e.data.type === 'funil:navigate') funilNavigate(e.data.view);
});
window.addEventListener('hashchange', function(){ funilNavigate((location.hash || '').replace('#','')); });
"""
app = must_replace(app, "(async function boot(){", bridge + "\n(async function boot(){")

# ---------------------------------------------------------------- CSS
css = re.sub(r"\n\s*body\{\n\s*background:var\(--page\);\n\s*font-family:'Inter',sans-serif;",
             "\n  body{\n    background:var(--page);\n    font-family:'Inter',sans-serif;", css, count=1)
fontface = []
for fam, slug, variants in [
    ('Inter', 'inter', [(w, 'normal') for w in (400, 500, 600, 700, 800)]),
    ('Montserrat', 'montserrat', [(w, 'normal') for w in (400, 500, 600, 700, 800)] + [(w, 'italic') for w in (400, 500, 600)]),
    ('Merriweather', 'merriweather', [(400, 'normal'), (700, 'normal'), (400, 'italic'), (700, 'italic')]),
]:
    for w, st in variants:
        fn = f'{slug}-latin-{w}-{st}.woff2'
        shutil.copy(os.path.join(FONTS, slug, 'files', fn), os.path.join(OUT, 'fonts', fn))
        fontface.append(f"@font-face{{font-family:'{fam}';font-style:{st};font-weight:{w};font-display:swap;src:url(fonts/{fn}) format('woff2');}}")

open(os.path.join(OUT, 'funil.css'), 'w', encoding='utf-8').write('\n'.join(fontface) + '\n' + css)
open(os.path.join(OUT, 'jspdf.umd.min.js'), 'w', encoding='utf-8').write(jspdf.strip() + '\n')
open(os.path.join(OUT, 'app.js'), 'w', encoding='utf-8').write(app.strip() + '\n')

# ---------------------------------------------------------------- index.html
body = re.sub(r'\s*<div class="topbar">.*?\n</div>\n', '\n', body, count=1, flags=re.S)
assert 'class="topbar"' not in body
page = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Funil de Vendas — Dashboard Financeiro</title>
<link rel="stylesheet" href="funil.css">
<link rel="stylesheet" href="dashboard-theme.css">
<script src="jspdf.umd.min.js" defer></script>
<script src="app.js" defer></script>
</head>
<body class="funil-embedded">
{body.strip()}
</body>
</html>
"""
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)
print('ok', {f: os.path.getsize(os.path.join(OUT, f)) for f in ('index.html', 'app.js', 'funil.css', 'jspdf.umd.min.js')})
