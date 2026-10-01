/**
 * SIGEP — Sistema de Gerenciamento Pedagógico · Núcleo FINAL v16
 * Estado de Goiás · SEDUCE · Ano letivo 2026
 * Melhorias: branding SIGEP, anti-travamento, animações, acessibilidade, cache offline
 */
const DB_URL = "https://siap-f9cbb-default-rtdb.firebaseio.com";
const AUTH_KEY = "siap_user";
const ANO_LETIVO = "2026";
const LOGO_GO = "https://repositorioweb.educacao.go.gov.br/logos/logo-gov-colorida.png";
const LOGO_GO_BARRA = "https://repositorioweb.educacao.go.gov.br/logos/seduce-gov-branca.png";
const LOGO_SEDUCE_BRANCA = LOGO_GO_BARRA;
const LOGO_SEDUCE = "https://repositorioweb.educacao.go.gov.br/logos/seduce-gov-branca.png";
const CORUJA_SIAP = "https://siap.educacao.go.gov.br/img/corujasite.png";

const USUARIOS_FIXOS = [
  { usuario: "secretaria", senha: "123456", nome: "Ana Secretaria", perfil: "Secretaria", escola: "520" },
  { usuario: "coordenacao", senha: "123456", nome: "Coord. Pedro Lima", perfil: "Coordenacao", escola: "520" },
  { usuario: "gestor", senha: "123456", nome: "Gestor João Costa", perfil: "Gestor", escola: "520" },
  { usuario: "professor", senha: "123456", nome: "Prof. Maria Silva", perfil: "Professor", escola: "520", profId: "p1" },
  { usuario: "prof2", senha: "123456", nome: "Prof. Carlos Mendes", perfil: "Professor", escola: "520", profId: "p2" },
  { usuario: "profhist", senha: "123456", nome: "Prof. Ana História", perfil: "Professor", escola: "520", profId: "p3" },
  { usuario: "profgeo", senha: "123456", nome: "Prof. João Geografia", perfil: "Professor", escola: "520", profId: "p4" }
];

let captchaAtual = "";

function gerarCaptcha() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  captchaAtual = "";
  for (let i = 0; i < 6; i++) captchaAtual += c[Math.floor(Math.random() * c.length)];
  const el = document.getElementById("captchaCodigo");
  if (el) el.textContent = captchaAtual;
}

async function fazerLogin(e) {
  if (e) e.preventDefault();
  const usuarioEl = document.getElementById("usuario");
  const senhaEl = document.getElementById("senha");
  const captchaEl = document.getElementById("captchaInput");
  const erro = document.getElementById("loginErro");

  if (!usuarioEl || !senhaEl) return false;

  const usuario = usuarioEl.value.trim();
  const senha = senhaEl.value;
  const captcha = captchaEl ? captchaEl.value.trim() : "";

  if (!usuario || !senha) {
    showLoginErro("Informe usuário e senha.");
    return false;
  }
  if (captchaEl && captcha !== captchaAtual) {
    showLoginErro("Código de segurança incorreto. Tente novamente.");
    gerarCaptcha();
    if (captchaEl) captchaEl.value = "";
    return false;
  }

  // 1) Fixos (com possível senha alterada em /contas)
  let user = null;
  const fixoCand = USUARIOS_FIXOS.find(u => u.usuario.toLowerCase() === usuario.toLowerCase());
  if (fixoCand) {
    let senhaOk = fixoCand.senha === senha;
    try {
      const ov = await obterSenhaConta(usuario);
      if (ov != null) senhaOk = (ov === senha);
    } catch (e) {}
    if (senhaOk) user = { ...fixoCand };
  }

  // 2) Professores cadastrados
  if (!user) {
    try {
      const proffs = (await fbGet(PATH.professores)) || {};
      const found = Object.values(proffs).find(p => {
        if (!p || !p.usuario) return false;
        if (String(p.usuario).toLowerCase() !== usuario.toLowerCase()) return false;
        if (p.ativo === false) return false;
        const senhaCad = String(p.senha || p.senhaInicial || "123456");
        return senhaCad === senha;
      });
      if (found) {
        user = {
          usuario: found.usuario,
          nome: found.nome || found.usuario,
          perfil: "Professor",
          escola: "520",
          profId: found.id,
          disciplinas: found.disciplinas || [],
          turmas: found.turmas || []
        };
      }
    } catch (err) {
      console.warn("Auth:", err);
      // continua — pode ser usuário fixo que já falhou
    }
  }

  if (!user) {
    showLoginErro("Usuário ou senha inválidos. Se for professor, confira se a Secretaria cadastrou seu login e senha.");
    gerarCaptcha();
    if (captchaEl) captchaEl.value = "";
    return false;
  }

  sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
  location.href = "menu.html";
  return false;
}

function showLoginErro(msg) {
  const erro = document.getElementById("loginErro");
  if (erro) {
    erro.style.display = "block";
    erro.textContent = msg;
  } else {
    alert(msg);
  }
}

function getUser() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
}

function exigirLogin(perfis) {
  const u = getUser();
  if (!u) {
    location.href = "login.html";
    return null;
  }
  if (perfis && !perfis.includes(u.perfil)) {
    toast("Acesso não permitido para o perfil " + u.perfil + ".", "erro");
    setTimeout(() => location.href = "menu.html", 1200);
    return null;
  }
  return u;
}

function sair() {
  sessionStorage.removeItem(AUTH_KEY);
  location.href = "login.html";
}

async function fbGet(path) {
  const key = cacheLocalKey(path);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${DB_URL}/${path}.json`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "PERMISSION_DENIED" : "HTTP " + r.status);
    const data = await r.json();
    // Servidor respondeu: ele é a fonte da verdade. Vazio (null) = limpa o cache local.
    if (data !== null && data !== undefined) {
      cacheLocalSet(key, data);
      return data;
    }
    try { localStorage.removeItem("siap_" + key); } catch (e) {}
    return null;
  } catch (e) {
    const local = cacheLocalGet(key);
    if (local !== null && local !== undefined) return local;
    throw e;
  }
}
async function fbPut(path, data) {
  const key = cacheLocalKey(path);
  cacheLocalSet(key, data);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${DB_URL}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "PERMISSION_DENIED" : "HTTP " + r.status);
    return r.json();
  } catch (e) {
    // Offline ou timeout: dados permanecem no cache local e não se perdem ao atualizar
    return data;
  }
}
/** Remove do cache local o caminho, seus filhos e seus pais (evita listas antigas reaparecerem) */
function invalidarCachePath(path) {
  const k = cacheLocalKey(path);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const full = localStorage.key(i);
    if (!full || !full.startsWith("siap_path_")) continue;
    const o = full.slice(5);
    if (o === k || o.startsWith(k + "_") || k.startsWith(o + "_")) {
      try { localStorage.removeItem(full); } catch (e) {}
    }
  }
}
/** Apaga TODAS as chaves siap_* do localStorage deste navegador */
function limparTodoCacheLocal() {
  const keys = [];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith("siap_")) keys.push(k);
  }
  keys.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  return keys.length;
}
async function fbDelete(path) {
  try { invalidarCachePath(path); } catch (e) {}
  try {
    const r = await fetch(`${DB_URL}/${path}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "null" });
    if (r.ok) return true;
  } catch (e) {}
  const r2 = await fetch(`${DB_URL}/${path}.json`, { method: "DELETE" });
  if (!r2.ok) throw new Error("HTTP " + r2.status);
  return true;
}


/** Overlay de carregamento com anti-travamento (auto-fecha em 25s) */
let _siapLoadTimer = null;
let _siapLoadWatchdog = null;
function mostrarCarregando(msg) {
  let el = document.getElementById("siapLoading");
  if (!el) {
    el = document.createElement("div");
    el.id = "siapLoading";
    el.className = "siap-loading";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-live", "assertive");
    el.setAttribute("aria-busy", "true");
    el.innerHTML = `<div class="siap-loading-box" role="status">
      <div class="siap-sync-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="48" height="48"><path fill="#1a5f9e" d="M32 8a24 24 0 0 1 20.8 12.2l-5.2 3A18 18 0 0 0 32 14v8l12-10L32 2v6zm0 48a24 24 0 0 1-20.8-12.2l5.2-3A18 18 0 0 0 32 50v-8L20 52l12 10v-6z"/></svg>
      </div>
      <p id="siapLoadingMsg">Aguarde...</p>
      <p class="siap-loading-hint">Carregando dados</p>
    </div>`;
    document.body.appendChild(el);
  }
  const m = document.getElementById("siapLoadingMsg");
  if (m) m.textContent = msg || "Aguarde...";
  el.classList.add("visivel");
  document.body.classList.add("siap-busy");
  clearTimeout(_siapLoadTimer);
  clearTimeout(_siapLoadWatchdog);
  // Anti-travamento: fecha overlay automaticamente se a operação demorar demais
  _siapLoadWatchdog = setTimeout(() => {
    ocultarCarregando();
    try { toast("A operação demorou mais que o esperado. Tente novamente.", "info"); } catch (_) {}
  }, 25000);
}
function ocultarCarregando() {
  const el = document.getElementById("siapLoading");
  if (el) el.classList.remove("visivel");
  document.body.classList.remove("siap-busy");
  clearTimeout(_siapLoadTimer);
  clearTimeout(_siapLoadWatchdog);
}

/** Transição suave entre páginas / abas */
function siapTransicao(fn) {
  // Sem animação de página — executa direto (layout estável)
  return Promise.resolve().then(() => (typeof fn === "function" ? fn() : null));
}

/** Detector de interface congelada — libera overlay se o main thread travar */
(function antiTravamento() {
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (now - last > 8000) {
      // Main thread ficou parado; força liberação visual
      try { ocultarCarregando(); } catch (_) {}
    }
    last = now;
  }, 2000);
  // Escape fecha overlay de carregamento
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const el = document.getElementById("siapLoading");
      if (el && el.classList.contains("visivel")) ocultarCarregando();
    }
  });
})();

async function gerarMatricula() {
  const ano = ANO_LETIVO;
  let seq = 1;
  try {
    const alunos = (await fbGet(PATH.alunos)) || {};
    const nums = Object.values(alunos).map(a => {
      const m = String(a.matricula || "").replace(/\D/g, "");
      if (m.startsWith(ano)) return parseInt(m.slice(4), 10) || 0;
      return 0;
    });
    seq = (nums.length ? Math.max(...nums) : 0) + 1;
  } catch (e) {}
  return ano + String(seq).padStart(4, "0");
}

async function buscarCep(cep) {
  const limpo = String(cep || "").replace(/\D/g, "");
  if (limpo.length !== 8) throw new Error("CEP inválido");
  const r = await fetch("https://viacep.com.br/ws/" + limpo + "/json/");
  const j = await r.json();
  if (j.erro) throw new Error("CEP não encontrado");
  return {
    logradouro: j.logradouro || "",
    bairro: j.bairro || "",
    cidade: j.localidade || "",
    uf: j.uf || "",
    cep: j.cep || limpo
  };
}


function siapConfirmar(mensagem, titulo) {
  return new Promise(resolve => {
    let bg = document.getElementById("siapConfirmBg");
    if (!bg) {
      bg = document.createElement("div");
      bg.id = "siapConfirmBg";
      bg.className = "siap-confirm-bg";
      bg.innerHTML = `<div class="siap-confirm-box">
        <h3 id="siapConfirmTitulo">Confirmação</h3>
        <p id="siapConfirmMsg"></p>
        <div class="siap-confirm-acoes">
          <button type="button" class="btn btn-secundario" id="siapConfirmNao">Cancelar</button>
          <button type="button" class="btn btn-primario" id="siapConfirmSim">Confirmar</button>
        </div>
      </div>`;
      document.body.appendChild(bg);
    }
    document.getElementById("siapConfirmTitulo").textContent = titulo || "Confirmação";
    document.getElementById("siapConfirmMsg").textContent = mensagem;
    bg.classList.add("aberto");
    const fechar = (v) => { bg.classList.remove("aberto"); resolve(v); };
    document.getElementById("siapConfirmSim").onclick = () => fechar(true);
    document.getElementById("siapConfirmNao").onclick = () => fechar(false);
  });
}

/** Cache local offline-first: sem TTL de expiração (dados gravados não somem ao atualizar) */
function cacheLocalGet(chave) {
  try {
    const raw = localStorage.getItem("siap_" + chave);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "_v" in parsed) return parsed._v;
    return parsed;
  } catch { return null; }
}
function cacheLocalSet(chave, dados) {
  try {
    localStorage.setItem("siap_" + chave, JSON.stringify({ _ts: Date.now(), _v: dados }));
  } catch (e) {}
}
function cacheLocalKey(path) {
  return "path_" + String(path).replace(/\//g, "_");
}
/** Leitura paralela de vários paths Firebase */
async function fbGetMany(paths) {
  const results = await Promise.all(paths.map(p => fbGet(p).catch(() => null)));
  const out = {};
  paths.forEach((p, i) => { out[p] = results[i]; });
  return out;
}


function toast(msg, tipo = "info") {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    t.setAttribute("role", "status");
    t.setAttribute("aria-live", "polite");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = "toast " + tipo + " mostrar";
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove("mostrar"), 4200);
}

function parseNota(v) {
  if (v === "" || v == null) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : Math.min(10, Math.max(0, n));
}
function fmtNota(n) {
  if (n == null || n === "") return "—";
  return Number(n).toFixed(1).replace(".", ",");
}
function statusMedia(m) {
  if (m == null) return { t: "—", c: "" };
  if (m >= 6) return { t: "Aprovado", c: "status-aprovado" };
  if (m >= 4) return { t: "Recuperação", c: "status-recuperacao" };
  return { t: "Reprovado", c: "status-reprovado" };
}
function slug(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "");
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function dataHoje() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function agoraISO() { return new Date().toISOString(); }

function exportarCSV(nomeArquivo, headers, rows) {
  const esc = v => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(";")];
  rows.forEach(r => lines.push(r.map(esc).join(";")));
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  a.click();
  toast("Exportado: " + nomeArquivo, "sucesso");
}


/** Impressão padronizada com logo do Estado de Goiás */
function imprimirComLogo(titulo, corpoHtml, opts) {
  opts = opts || {};
  const orient = opts.orientacao || "portrait";
  const sub = opts.subtitulo || "COLÉGIO ESTADUAL — CÓDIGO 520";
  const extraAssin = opts.assinaturas || "";
  const w = window.open("", "_blank");
  if (!w) { toast("PERMITA JANELAS POP-UP PARA IMPRESSÃO.", "erro"); return; }
  const tit = String(titulo || "").toUpperCase();
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${tit}</title>
  <style>
    body{font-family:"Times New Roman",Times,serif;margin:0;padding:12mm;color:#000;font-size:12pt;line-height:1.35}
    .cab{display:flex;align-items:center;gap:14px;border-bottom:2.5px solid #0d3a66;padding-bottom:10px;margin-bottom:14px}
    .cab img{height:52px}
    .cab h1{font-size:12pt;margin:0;color:#0d3a66;font-family:Arial,sans-serif;letter-spacing:.3px}
    .cab p{margin:2px 0;font-size:9pt;color:#333;font-family:Arial,sans-serif}
    .titulo{text-align:center;font-weight:700;font-size:13pt;margin:10px 0 16px;color:#0d3a66;
      font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:1px}
    .corpo{text-align:justify;font-size:12pt}
    .corpo p{margin:0 0 10px}
    table{width:100%;border-collapse:collapse;font-size:10pt;font-family:Arial,sans-serif}
    th,td{border:1px solid #333;padding:4px 6px}
    th{background:#e8eef5;text-transform:uppercase;font-size:9pt}
    .assinaturas{margin-top:36px;display:flex;justify-content:space-around;gap:24px;text-align:center;font-size:10pt}
    .assinaturas div{flex:1;max-width:240px}
    .assinaturas .linha{border-top:1px solid #000;margin-top:48px;padding-top:6px}
    .rodape{margin-top:28px;font-size:8pt;color:#555;display:flex;justify-content:space-between;
      border-top:1px solid #999;padding-top:8px;font-family:Arial,sans-serif}
    @page{size:A4 ${orient};margin:12mm}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="cab">
    <img src="${LOGO_GO}" alt="ESTADO DE GOIÁS" onerror="this.style.display='none'"/>
    <div>
      <h1>ESTADO DE GOIÁS — SECRETARIA DE ESTADO DA EDUCAÇÃO</h1>
      <p>${sub}</p>
      <p>SISTEMA SIGEP · ANO LETIVO ${ANO_LETIVO}</p>
    </div>
  </div>
  <div class="titulo">${tit}</div>
  <div class="corpo">${corpoHtml}</div>
  ${extraAssin || `<div class="assinaturas">
    <div><div class="linha">DIRETOR(A)</div></div>
    <div><div class="linha">SECRETÁRIO(A) ESCOLAR</div></div>
  </div>`}
  <div class="rodape">
    <span>DOCUMENTO EMITIDO EM ${new Date().toLocaleString("pt-BR").toUpperCase()} · SIGEP GOIÁS</span>
    <span>VÁLIDO MEDIANTE ASSINATURA E CARIMBO DA UNIDADE</span>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
  </body></html>`);
  w.document.close();
}

/** Modelos oficiais de documentos escolares */
function gerarAdvertencia(aluno, motivo, numero) {
  const u = getUser() || {};
  const data = new Date().toLocaleDateString("pt-BR");
  const nome = String(aluno.nome || "").toUpperCase();
  const mat = aluno.matricula || "—";
  const turma = aluno.turmaNome || aluno.turma || "—";
  const mot = String(motivo || "").toUpperCase();
  const num = numero || ("ADV-" + ANO_LETIVO + "-" + String(Date.now()).slice(-5));
  const html = `
    <p><strong>Nº DO DOCUMENTO:</strong> ${num}</p>
    <p>A DIREÇÃO DESTA UNIDADE ESCOLAR, NO USO DE SUAS ATRIBUIÇÕES LEGAIS E REGIMENTAIS,
    RESOLVE APLICAR A PRESENTE <strong>ADVERTÊNCIA ESCRITA</strong> AO(À) ESTUDANTE:</p>
    <p><strong>NOME:</strong> ${nome}<br/>
    <strong>MATRÍCULA:</strong> ${mat}<br/>
    <strong>TURMA:</strong> ${String(turma).toUpperCase()}</p>
    <p><strong>MOTIVO:</strong> ${mot || "CONFORME REGISTRO DISCIPLINAR DA UNIDADE."}</p>
    <p>FICA O(A) ESTUDANTE CIENTE DE QUE A REINCIDÊNCIA PODERÁ ACARRETAR MEDIDAS
    DISCIPLINARES CABÍVEIS, NOS TERMOS DO REGIMENTO ESCOLAR E DA LEGISLAÇÃO VIGENTE.</p>
    <p>GOIÂNIA/GO, ${data}.</p>
    <p style="font-size:10pt;margin-top:16px">REGISTRADO POR: ${String(u.nome||"").toUpperCase()} · PERFIL: ${String(u.perfil||"").toUpperCase()}</p>`;
  imprimirComLogo("ADVERTÊNCIA ESCRITA", html, { orientacao: "portrait" });
  return num;
}

function gerarDocumentoGenerico(tipo, campos) {
  const u = getUser() || {};
  const data = new Date().toLocaleDateString("pt-BR");
  const c = campos || {};
  const blocos = Object.entries(c).map(([k,v]) =>
    `<p><strong>${String(k).toUpperCase()}:</strong> ${String(v||"—").toUpperCase()}</p>`
  ).join("");
  const html = `
    ${blocos}
    <p style="margin-top:16px">DOCUMENTO EXPEDIDO PARA OS FINS A QUE SE DESTINA,
    ÀS ${new Date().toLocaleTimeString("pt-BR")}, EM ${data}.</p>
    <p style="font-size:10pt">RESPONSÁVEL PELA EMISSÃO: ${String(u.nome||"").toUpperCase()}</p>`;
  imprimirComLogo(String(tipo || "DOCUMENTO ESCOLAR").toUpperCase(), html, { orientacao: "portrait" });
}

function montarTopo(titulo, sub) {
  const u = getUser() || {};
  const logoBarra = (typeof LOGO_GO_BARRA !== "undefined" && LOGO_GO_BARRA) ? LOGO_GO_BARRA : LOGO_GO;
  return `
  <header class="topo" role="banner">
    <div class="topo-esquerda">
      <button type="button" class="btn-menu-sistema" onclick="location.href='menu.html'" title="Ir para o menu do sistema" aria-label="Abrir menu do sistema">☰ Menu</button>
      <img src="${logoBarra}" alt="Logo do Estado de Goiás" class="logo-go-barra"
           onerror="this.onerror=null;this.src='${LOGO_GO}'" />
      <div class="topo-titulo-box">
        <div class="topo-marca">SIGEP <span>· ESTADO DE GOIÁS</span></div>
        <h1>${titulo}</h1>
        <div class="escola">${sub || "UNIDADE 520 — COLÉGIO ESTADUAL"}</div>
      </div>
    </div>
    <div class="topo-direita">
      <div class="topo-meta">
        <div>Ano letivo <strong>${ANO_LETIVO}</strong></div>
        <div id="dataTopo"></div>
      </div>
      <div class="topo-user">
        <span id="nomeUsuario" aria-label="Usuário logado">${u.nome || ""}</span>
        <span class="badge-perfil" aria-label="Perfil">${u.perfil || ""}</span>
        <a href="conta.html" class="btn-link-senha" title="Alterar senha" aria-label="Alterar minha senha">Senha</a>
        <button type="button" class="btn-sair" onclick="sair()" aria-label="Sair do sistema">Sair</button>
      </div>
    </div>
  </header>`;
}

const PATH = {
  meta: "siap/meta",
  turmas: "siap/turmas",
  alunos: "siap/alunos",
  professores: "siap/professores",
  contas: "siap/contas",
  disciplinas: "siap/disciplinas",
  vinculos: "siap/vinculos",
  alvaras: "siap/alvaras",
  alvarasBloco: "siap/alvaras_bloco",
  blocos: "siap/blocos",
  historico: "siap/historico",
  matriculas: "siap/matriculas",
  turmasAntigas: "siap/turmas_antigas",
  diario: (ano, turma, discId, bim) =>
    `siap/arquivos_anuais/${ano}/turmas/${String(turma)}/disciplinas/${slug(String(discId))}/bimestre_${String(bim)}`,
  /** Chamada diária da escola (Secretaria) — por turma e data, não por disciplina */
  chamadaEscolar: (ano, turma) =>
    `siap/arquivos_anuais/${ano}/turmas/${String(turma)}/chamada_escolar`
};



function mediaLivres(aluno, colunas) {
  if (!colunas || !colunas.length) return null;
  const vals = colunas.map(c => (aluno.livres && aluno.livres[c] != null) ? aluno.livres[c] : null).filter(v => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function mediaBimestral(aluno, colunas) {
  const ml = mediaLivres(aluno, colunas);
  const bl = aluno.bloco;
  if (ml == null && bl == null) return null;
  return ((ml == null ? 0 : ml) * 0.6) + ((bl == null ? 0 : bl) * 0.4);
}
function mediaFinal(aluno, colunas) {
  const mb = mediaBimestral(aluno, colunas);
  if (mb == null) return null;
  if (aluno.recuperacao != null && aluno.recuperacao > mb) return aluno.recuperacao;
  return mb;
}

async function registrarHistorico(tipo, descricao, dados) {
  const id = uid();
  const u = getUser();
  const reg = { id, tipo, descricao, dados: dados || {}, usuario: u?.nome || "sistema", perfil: u?.perfil || "", timestamp: agoraISO() };
  try { await fbPut(PATH.historico + "/" + id, reg); } catch (e) {}
  return reg;
}

async function verificarAlvara(ano, bimestre) {
  try {
    const a = await fbGet(PATH.alvaras + "/" + ano + "_" + bimestre);
    if (!a) return true;
    return a.aberto === true;
  } catch { return true; }
}

/** Alvará específico da Prova de Bloco por disciplina e bimestre */
async function verificarAlvaraBloco(ano, bimestre, discId) {
  try {
    const key = `${ano}_${bimestre}_${slug(discId || "geral")}`;
    const a = await fbGet(PATH.alvarasBloco + "/" + key);
    if (!a) {
      // fallback: alvará geral do bimestre
      return await verificarAlvara(ano, bimestre);
    }
    return a.aberto === true;
  } catch { return false; }
}


/** Contas: senhas customizadas de usuários fixos e overrides */
async function obterSenhaConta(usuario) {
  try {
    const c = await fbGet(PATH.contas + "/" + slug(usuario.toLowerCase()));
    if (c && c.senha) return String(c.senha);
  } catch (e) {}
  return null;
}

async function salvarSenhaConta(usuario, senha, por) {
  const key = slug(usuario.toLowerCase());
  const data = { usuario, senha, atualizadoEm: agoraISO(), por: por || (getUser()?.nome || "") };
  await fbPut(PATH.contas + "/" + key, data);
  return data;
}

async function trocarMinhaSenha(senhaAtual, senhaNova) {
  const u = getUser();
  if (!u) throw new Error("Não autenticado");
  if (!senhaNova || senhaNova.length < 4) throw new Error("Nova senha deve ter ao menos 4 caracteres");

  // Professor cadastrado no sistema
  if (u.perfil === "Professor" && u.profId) {
    const prof = await fbGet(PATH.professores + "/" + u.profId);
    if (!prof) throw new Error("Professor não encontrado");
    const atual = String(prof.senha || prof.senhaInicial || "123456");
    // também verifica override em contas
    const override = await obterSenhaConta(u.usuario);
    const senhaCorreta = override || atual;
    if (senhaAtual !== senhaCorreta) throw new Error("Senha atual incorreta");
    prof.senha = senhaNova;
    prof.senhaInicial = senhaNova;
    await fbPut(PATH.professores + "/" + u.profId, prof);
    await salvarSenhaConta(u.usuario, senhaNova, u.nome);
    await registrarHistorico("senha", "Professor alterou a própria senha", { usuario: u.usuario });
    return true;
  }

  // Usuário fixo
  const fixo = USUARIOS_FIXOS.find(x => x.usuario.toLowerCase() === u.usuario.toLowerCase());
  if (!fixo) throw new Error("Conta não encontrada");
  const override = await obterSenhaConta(u.usuario);
  const senhaCorreta = override || fixo.senha;
  if (senhaAtual !== senhaCorreta) throw new Error("Senha atual incorreta");
  await salvarSenhaConta(u.usuario, senhaNova, u.nome);
  await registrarHistorico("senha", "Usuário alterou a própria senha", { usuario: u.usuario });
  return true;
}

async function resetarSenhaUsuario(usuario, novaSenha, tipo, profId) {
  const admin = getUser();
  if (!admin || !["Secretaria", "Gestor", "Coordenacao"].includes(admin.perfil)) {
    throw new Error("Sem permissão para resetar senha");
  }
  if (!novaSenha || novaSenha.length < 4) throw new Error("Senha inválida");
  if (tipo === "professor" && profId) {
    const prof = await fbGet(PATH.professores + "/" + profId);
    if (!prof) throw new Error("Professor não encontrado");
    prof.senha = novaSenha;
    prof.senhaInicial = novaSenha;
    await fbPut(PATH.professores + "/" + profId, prof);
  }
  await salvarSenhaConta(usuario, novaSenha, admin.nome);
  await registrarHistorico("senha_reset", "Senha resetada: " + usuario, { usuario, por: admin.nome });
  return true;
}





async function seedSistema() {
  const turmas = {
    "1B": { id: "1B", nome: "1ª Série B", serie: "1º Ano", turno: "Matutino", composicao: "Ensino Médio", ano: 2026, ativa: true, disciplinas: ["LP","MAT","HIS","GEO","FIS","QUI","BIO","ING"] },
    "2A": { id: "2A", nome: "2ª Série A", serie: "2º Ano", turno: "Vespertino", composicao: "Ensino Médio Integrado", ano: 2026, ativa: true, disciplinas: ["LP","MAT","HIS","GEO","ING"] },
    "3C": { id: "3C", nome: "3ª Série C", serie: "3º Ano", turno: "Matutino", composicao: "Ensino Médio", ano: 2026, ativa: true, disciplinas: ["LP","MAT","HIS","FIS","QUI","BIO"] },
    "1TA": { id: "1TA", nome: "1ª Técnico A — Informática", serie: "1º Ano Tec.", turno: "Matutino", composicao: "Ensino Médio Integrado", ano: 2026, ativa: true, disciplinas: ["LP","MAT","BD","LOG","PROG","ING"] },
    "2TA": { id: "2TA", nome: "2ª Técnico A — Informática", serie: "2º Ano Tec.", turno: "Vespertino", composicao: "Ensino Médio Integrado", ano: 2026, ativa: true, disciplinas: ["LP","MAT","REDES","WEB","BD","ING"] }
  };
  const disciplinas = {
    "LP": { id: "LP", codigo: "241", nome: "Língua Portuguesa", area: "Linguagens", carga: 4 },
    "MAT": { id: "MAT", codigo: "242", nome: "Matemática", area: "Matemática", carga: 4 },
    "HIS": { id: "HIS", codigo: "243", nome: "História", area: "Ciências Humanas", carga: 2 },
    "GEO": { id: "GEO", codigo: "244", nome: "Geografia", area: "Ciências Humanas", carga: 2 },
    "FIS": { id: "FIS", codigo: "245", nome: "Física", area: "Ciências da Natureza", carga: 2 },
    "QUI": { id: "QUI", codigo: "246", nome: "Química", area: "Ciências da Natureza", carga: 2 },
    "BIO": { id: "BIO", codigo: "247", nome: "Biologia", area: "Ciências da Natureza", carga: 2 },
    "ING": { id: "ING", codigo: "248", nome: "Língua Inglesa", area: "Linguagens", carga: 2 },
    "BD": { id: "BD", codigo: "301", nome: "Banco de Dados", area: "Técnico", carga: 2 },
    "LOG": { id: "LOG", codigo: "302", nome: "Lógica de Programação", area: "Técnico", carga: 2 },
    "PROG": { id: "PROG", codigo: "303", nome: "Linguagem de Programação", area: "Técnico", carga: 2 },
    "REDES": { id: "REDES", codigo: "304", nome: "Redes de Computadores", area: "Técnico", carga: 2 },
    "WEB": { id: "WEB", codigo: "305", nome: "Programação Web", area: "Técnico", carga: 2 }
  };
  const professores = {
    "p1": { id: "p1", nome: "Maria Silva", cpf: "111.111.111-11", usuario: "professor", senha: "123456", disciplinas: ["LP", "ING"], turmas: ["1B", "2A"], ativo: true },
    "p2": { id: "p2", nome: "Carlos Mendes", cpf: "222.222.222-22", usuario: "prof2", senha: "123456", disciplinas: ["MAT"], turmas: ["1B", "2A", "3C"], ativo: true },
    "p3": { id: "p3", nome: "Ana História", cpf: "333.333.333-33", usuario: "profhist", senha: "123456", disciplinas: ["HIS"], turmas: ["2A", "3C"], ativo: true },
    "p4": { id: "p4", nome: "João Geografia", cpf: "444.444.444-44", usuario: "profgeo", senha: "123456", disciplinas: ["GEO"], turmas: ["1B", "2A"], ativo: true }
  };
  // Alunos com nCham em ordem alfabetica por turma
  const alunos = {
    "a1": { id: "a1", nome: "ANA SILVA", turma: "2A", status: "Normal", matricula: "2026001", ano: 2026, homologado: true, sexo: "Feminino", nCham: 1, turno: "Vespertino" },
    "a3": { id: "a3", nome: "BRYAN OLIVEIRA", turma: "2A", status: "Normal", matricula: "2026003", ano: 2026, homologado: true, sexo: "Masculino", nCham: 2, turno: "Vespertino" },
    "a2": { id: "a2", nome: "GUILHERME PEREIRA BATISTA", turma: "2A", status: "Normal", matricula: "21118992003", ano: 2026, homologado: true, sexo: "Masculino", nCham: 3, turno: "Vespertino", inep: "130353780293" },
    "a6": { id: "a6", nome: "HELENA SOUZA", turma: "2A", status: "Normal", matricula: "2026006", ano: 2026, homologado: true, sexo: "Feminino", nCham: 4, turno: "Vespertino" },
    "a4": { id: "a4", nome: "EMILLY ROCHA", turma: "1B", status: "Normal", matricula: "2026004", ano: 2026, homologado: true, sexo: "Feminino", nCham: 1, turno: "Matutino" },
    "a5": { id: "a5", nome: "GABRIEL PEREIRA", turma: "1B", status: "Normal", matricula: "2026005", ano: 2026, homologado: true, sexo: "Masculino", nCham: 2, turno: "Matutino" },
    "a8": { id: "a8", nome: "JULIA ALMEIDA", turma: "1B", status: "Normal", matricula: "2026008", ano: 2026, homologado: true, sexo: "Feminino", nCham: 3, turno: "Matutino" },
    "a9": { id: "a9", nome: "LUCAS FERREIRA", turma: "1B", status: "Normal", matricula: "2026009", ano: 2026, homologado: true, sexo: "Masculino", nCham: 4, turno: "Matutino" },
    "a7": { id: "a7", nome: "IGOR MARTINS", turma: "3C", status: "Normal", matricula: "2026007", ano: 2026, homologado: true, sexo: "Masculino", nCham: 1, turno: "Matutino" },
    "a10": { id: "a10", nome: "MARINA COSTA", turma: "3C", status: "Normal", matricula: "2026010", ano: 2026, homologado: true, sexo: "Feminino", nCham: 2, turno: "Matutino" }
  };
  const vinculos = {
    "v1": { id:"v1", professorId: "p1", turmaId: "2A", disciplinaId: "LP", ano: 2026 },
    "v2": { id:"v2", professorId: "p2", turmaId: "2A", disciplinaId: "MAT", ano: 2026 },
    "v3": { id:"v3", professorId: "p3", turmaId: "2A", disciplinaId: "HIS", ano: 2026 },
    "v4": { id:"v4", professorId: "p4", turmaId: "2A", disciplinaId: "GEO", ano: 2026 },
    "v5": { id:"v5", professorId: "p3", turmaId: "3C", disciplinaId: "HIS", ano: 2026 },
    "v6": { id:"v6", professorId: "p4", turmaId: "1B", disciplinaId: "GEO", ano: 2026 },
    "v7": { id:"v7", professorId: "p1", turmaId: "1B", disciplinaId: "LP", ano: 2026 },
    "v8": { id:"v8", professorId: "p2", turmaId: "1B", disciplinaId: "MAT", ano: 2026 },
    "v9": { id:"v9", professorId: "p1", turmaId: "1TA", disciplinaId: "LP", ano: 2026 },
    "v10": { id:"v10", professorId: "p2", turmaId: "1TA", disciplinaId: "MAT", ano: 2026 },
    "v11": { id:"v11", professorId: "p1", turmaId: "1TA", disciplinaId: "BD", ano: 2026 },
    "v12": { id:"v12", professorId: "p2", turmaId: "1TA", disciplinaId: "LOG", ano: 2026 },
    "v13": { id:"v13", professorId: "p1", turmaId: "2TA", disciplinaId: "LP", ano: 2026 },
    "v14": { id:"v14", professorId: "p2", turmaId: "2TA", disciplinaId: "WEB", ano: 2026 },
    "v15": { id:"v15", professorId: "p1", turmaId: "2TA", disciplinaId: "BD", ano: 2026 }
  };
  const alvaras = {};
  const alvarasBloco = {};
  for (let b = 1; b <= 4; b++) {
    alvaras[`2026_${b}`] = {
      ano: 2026, bimestre: b,
      aberto: b === 2,
      abertoEm: b === 2 ? agoraISO() : null,
      fechadoEm: null,
      por: b === 2 ? "Coordenacao" : null
    };
    // Bloco liberado no 2º bimestre para todas disciplinas demo
    ["HIS", "GEO", "LP", "MAT"].forEach(d => {
      alvarasBloco[`2026_${b}_${d}`] = {
        ano: 2026, bimestre: b, disciplinaId: d,
        aberto: b === 2,
        abertoEm: b === 2 ? agoraISO() : null,
        por: b === 2 ? "Coordenacao" : null
      };
    });
  }

  await Promise.all([
    fbPut(PATH.turmas, turmas),
    fbPut(PATH.disciplinas, disciplinas),
    fbPut(PATH.professores, professores),
    fbPut(PATH.alunos, alunos),
    fbPut(PATH.vinculos, vinculos),
    fbPut(PATH.alvaras, alvaras),
    fbPut(PATH.alvarasBloco, alvarasBloco),
    fbPut(PATH.meta, { seedEm: agoraISO(), versao: "16.0-final", ano: 2026 })
  ]);
  await registrarHistorico("seed", "Inicialização FINAL v16 — ano 2026", {});
  toast("Sistema inicializado (SIGEP v16 · 2026)!", "sucesso");
}

/** Força maiúsculas em campos cadastrais (não aplica em login, senha, usuário, busca, e-mail) */
function forcarMaiusculas(root) {
  if (document.body && document.body.classList.contains("login-page")) return;
  const el = root || document;
  const skipIds = new Set(["usuario", "senha", "captchaInput", "captchaCodigo", "busca", "c_atual", "c_nova", "c_conf", "p_user", "p_senha"]);
  el.querySelectorAll("input[type=text], input:not([type]), textarea").forEach(inp => {
    if (inp.type === "password" || inp.type === "number" || inp.type === "date" || inp.type === "search" || inp.readOnly) return;
    if (inp.id && skipIds.has(inp.id)) return;
    if (inp.autocomplete === "username" || inp.autocomplete === "current-password" || inp.autocomplete === "new-password") return;
    if (inp.closest && inp.closest(".login-form")) return;
    inp.addEventListener("input", function() {
      const s = this.selectionStart, e = this.selectionEnd;
      this.value = this.value.toUpperCase();
      try { this.setSelectionRange(s, e); } catch (_) {}
    });
  });
}


/** Árvore de menus estilo SEI (menu → submenu → sub-submenu) por perfil */
const MENU_SEI = {
  Secretaria: [
    { t: "Cadastros", filhos: [
      { t: "Hub da Secretaria", href: "secretaria.html", d: true },
      { t: "Turmas", href: "sec-turmas.html" },
      { t: "Alunos", href: "sec-alunos.html" },
            { t: "Professores", href: "sec-professores.html" },
      { t: "Disciplinas", href: "sec-disciplinas.html" },
      { t: "Vínculos (Prof × Turma × Disc.)", href: "sec-vinculos.html" }
    ]},
    { t: "Movimentação e Protocolo", filhos: [
      { t: "Movimentação de alunos", href: "sec-movimentacao.html" },
      { t: "Alvarás de diário e bloco", href: "sec-alvaras.html" },
      { t: "Provas de Bloco (relação)", href: "sec-blocos.html" },
      { t: "Turmas antigas / arquivo", href: "sec-antigas.html" },
      { t: "Histórico de operações", href: "sec-historico.html" },
      { t: "Documentos e advertências", href: "sec-documentos.html", d: true }
    ]},
    { t: "Pedagógico", filhos: [
      { t: "Lista piloto da turma", href: "lista-piloto.html" },
      { t: "Frequência escolar (gestão)", href: "freq-escola.html" },
      { t: "Diário (consulta)", href: "diario-inicio.html" },
      { t: "Prova de Bloco", href: "bloco.html" }
    ]},
    { t: "Relatórios e Indicadores", filhos: [
      { t: "Painel gerencial", href: "painel.html", d: true },
      { t: "Boletim escolar", href: "boletim.html" },
      { t: "Exportações / relatórios", href: "relatorios.html" }
    ]},
    { t: "Conta", filhos: [
      { t: "Alterar minha senha", href: "conta.html" }
    ]}
  ],
  Gestor: [
    { t: "Cadastros", filhos: [
      { t: "Hub da Secretaria", href: "secretaria.html", d: true },
      { t: "Turmas", href: "sec-turmas.html" },
      { t: "Alunos", href: "sec-alunos.html" },
            { t: "Professores", href: "sec-professores.html" },
      { t: "Disciplinas", href: "sec-disciplinas.html" },
      { t: "Vínculos", href: "sec-vinculos.html" }
    ]},
    { t: "Protocolo e Liberação", filhos: [
      { t: "Movimentação", href: "sec-movimentacao.html" },
      { t: "Alvarás", href: "sec-alvaras.html" },
      { t: "Histórico", href: "sec-historico.html" },
      { t: "Documentos e advertências", href: "sec-documentos.html" }
    ]},
    { t: "Pedagógico", filhos: [
      { t: "Diário do professor", href: "diario-inicio.html" },
      { t: "Prova de Bloco", href: "bloco.html" },
      { t: "Frequência escolar", href: "freq-escola.html" },
      { t: "Lista piloto", href: "lista-piloto.html" }
    ]},
    { t: "Relatórios", filhos: [
      { t: "Painel gerencial", href: "painel.html", d: true },
      { t: "Boletins", href: "boletim.html" },
      { t: "Exportações", href: "relatorios.html" }
    ]},
    { t: "Conta", filhos: [ { t: "Alterar senha", href: "conta.html" } ]}
  ],
  Coordenacao: [
    { t: "Liberação e Protocolo", filhos: [
      { t: "Alvarás de diário e bloco", href: "sec-alvaras.html", d: true },
      { t: "Prova de Bloco", href: "bloco.html" },
      { t: "Histórico", href: "sec-historico.html" }
    ]},
    { t: "Acompanhamento", filhos: [
      { t: "Diário (consulta)", href: "diario-inicio.html" },
      { t: "Frequência escolar", href: "freq-escola.html" },
      { t: "Lista piloto", href: "lista-piloto.html" }
    ]},
    { t: "Relatórios", filhos: [
      { t: "Relatórios", href: "relatorios.html" },
      { t: "Boletins", href: "boletim.html" }
    ]},
    { t: "Conta", filhos: [ { t: "Alterar senha", href: "conta.html" } ]}
  ],
  Professor: [
    { t: "Operações pedagógicas", filhos: [
      { t: "Diário do professor", href: "diario-inicio.html", d: true },
      { t: "Prova de Bloco (sua disciplina)", href: "bloco.html" }
    ]},
    { t: "Consultas", filhos: [
      { t: "Boletim do aluno", href: "boletim.html" },
      { t: "Exportar notas", href: "relatorios.html" }
    ]},
    { t: "Conta", filhos: [ { t: "Alterar minha senha", href: "conta.html" } ]}
  ]
};

function montarArvoreSei(nos, nivel) {
  nivel = nivel || 0;
  return (nos || []).map((n, i) => {
    if (n.filhos && n.filhos.length) {
      const id = "sei_n_" + nivel + "_" + i + "_" + Math.random().toString(36).slice(2, 6);
      return `<div class="sei-node" id="${id}">
        <div class="sei-label" onclick="this.parentElement.classList.toggle('aberto')">
          <span class="sei-chev">▸</span><span>${n.t}</span>
        </div>
        <div class="sei-children">${montarArvoreSei(n.filhos, nivel + 1)}</div>
      </div>`;
    }
    return `<div class="sei-leaf"><a href="${n.href || '#'}" class="${n.d ? 'destaque' : ''}">${n.t}</a></div>`;
  }).join("");
}

function montarMenuSei(perfil) {
  const arv = MENU_SEI[perfil] || MENU_SEI.Professor;
  // Abre o primeiro grupo por padrão
  setTimeout(() => {
    const first = document.querySelector(".sei-tree .sei-node");
    if (first) first.classList.add("aberto");
  }, 30);
  return `
  <aside class="sei-aside">
    <div class="sei-aside-head">Menu do sistema · ${perfil || ""}</div>
    <nav class="sei-tree">${montarArvoreSei(arv)}</nav>
  </aside>`;
}

function montarBreadcrumb(itens) {
  // itens: [{t, href?}, ...] último é o atual
  if (!itens || !itens.length) return "";
  const parts = itens.map((it, i) => {
    if (i === itens.length - 1 || !it.href) return `<span class="atual">${it.t}</span>`;
    return `<a href="${it.href}">${it.t}</a><span class="sep">›</span>`;
  });
  return `<div class="sei-breadcrumb">${parts.join("")}</div>`;
}


/** Barra de módulos padronizada (submenu da Secretaria) */
function montarNavSec(ativa) {
  const itens = [
    ["secretaria.html", "Hub"],
    ["sec-turmas.html", "Turmas"],
    ["sec-alunos.html", "Alunos"],
    ["sec-professores.html", "Professores"],
    ["sec-disciplinas.html", "Disciplinas"],
    ["sec-vinculos.html", "Vínculos"],
    ["sec-movimentacao.html", "Movimentação"],
    ["sec-alvaras.html", "Alvarás"],
    ["sec-blocos.html", "Provas Bloco"],
    ["sec-documentos.html", "Documentos"],
    ["sec-antigas.html", "Antigas"],
    ["sec-historico.html", "Histórico"],
    ["painel.html", "Painel"],
    ["chamada-diaria.html", "Chamada diária"],
    ["lista-piloto.html", "Lista piloto"]
  ];
  return itens.map(([href, label]) => {
    const cls = (ativa && (ativa === href || ativa === label.toLowerCase())) ? "ativa" : "";
    return `<a href="${href}" class="${cls}">${label}</a>`;
  }).join("");
}
function aplicarNavSec(ativa) {
  // Barra horizontal de módulos desativada — navegação só pelo Menu / submenus
  document.querySelectorAll("nav.nav-sec").forEach(nav => {
    nav.style.display = "none";
    nav.innerHTML = "";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  forcarMaiusculas();
  document.querySelectorAll("nav.nav-sec").forEach(n => { n.style.display = "none"; n.innerHTML = ""; });
  document.body.classList.add("siap-ready");
  // Skip links for accessibility
  if (!document.getElementById("siapSkip")) {
    const skip = document.createElement("a");
    skip.id = "siapSkip";
    skip.href = "#conteudoPrincipal";
    skip.className = "siap-skip-link";
    skip.textContent = "Ir para o conteúdo principal";
    document.body.insertBefore(skip, document.body.firstChild);
  }
  const main = document.querySelector("main.conteudo");
  if (main && !main.id) main.id = "conteudoPrincipal";
});
