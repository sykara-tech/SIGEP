/**
 * SIGEP — Diário do Professor (FINAL v14)
 * Seleção única de turma/disciplina · Abas livres (notas/frequência/planejamento)
 * Filtro por vínculos · Alvará · Bloco por disciplina (discId) · Cache
 */
let alunos = [];
let colunasLivres = ["N1 Caderno", "N2 Atividade", "Prod. Textual"];
let frequencias = {};
let diaSel = null;
let mesCal = new Date().getMonth();
let anoCal = new Date().getFullYear();
let planejamentos = [];
let turmasMap = {};
let discMap = {};
let diarioAberto = true;
let user = null;

function trocarAba(el) {
  document.querySelectorAll(".aba").forEach(a => a.classList.remove("ativa"));
  el.classList.add("ativa");
  document.querySelectorAll(".painel").forEach(p => p.style.display = "none");
  const painel = document.getElementById("painel-" + el.dataset.aba);
  if (painel) painel.style.display = "block";
  try { sessionStorage.setItem("siap_diario_aba", el.dataset.aba); } catch (e) {}
  if (el.dataset.aba === "frequencia") montarCal();
  if (el.dataset.aba === "conteudo") { loadConteudo(); loadPlanejamento(); }
}

function pathD() {
  // Usa sempre o código da disciplina (ID), nunca só o nome — evita misturar matérias
  const ctx = getDiarioCtx();
  const ano = ctx.ano || ANO_LETIVO;
  const turma = ctx.turma || (document.getElementById("serie") || {}).value || "";
  const discId = ctx.discId || (document.getElementById("disciplina") || {}).value || "";
  const bim = ctx.bim || (document.getElementById("bimestre") || {}).value || "2";
  if (!turma || !discId) throw new Error("Turma ou disciplina não definida");
  return PATH.diario(ano, turma, discId, bim);
}
function getDiarioCtx() {
  try { return JSON.parse(sessionStorage.getItem("siap_diario_ctx") || "{}"); } catch { return {}; }
}

async function initFiltros() {
  try {
    turmasMap = (await fbGet(PATH.turmas)) || {};
    discMap = (await fbGet(PATH.disciplinas)) || {};
  } catch (e) {
    toast("Não foi possível carregar turmas/disciplinas: " + e.message, "erro");
    turmasMap = { "2A": { id: "2A", nome: "2ª Série A" } };
    discMap = { "LP": { id: "LP", nome: "Língua Portuguesa" } };
  }

  let turmasOpts = Object.values(turmasMap);
  let discOpts = Object.values(discMap);

  // Para professor, a fonte principal é o vínculo EXATO:
  // professor + turma + disciplina. Isso evita o antigo cruzamento
  // indevido entre todas as turmas e todas as disciplinas.
  window.professorVinculos = [];
  if (user && user.perfil === "Professor") {
    try {
      const vinculos = (await fbGet(PATH.vinculos)) || {};
      window.professorVinculos = Object.values(vinculos).filter(v => v.professorId === user.profId);
    } catch (e) {
      window.professorVinculos = [];
    }

    if (window.professorVinculos.length) {
      const turmasPermitidas = [...new Set(window.professorVinculos.map(v => v.turmaId))];
      const disciplinasPermitidas = [...new Set(window.professorVinculos.map(v => v.disciplinaId))];
      turmasOpts = turmasOpts.filter(t => turmasPermitidas.includes(t.id));
      discOpts = discOpts.filter(d => disciplinasPermitidas.includes(d.id));
    } else {
      // Compatibilidade com cadastros antigos sem vínculos.
      const prof = user.profId ? await fbGet(PATH.professores + "/" + user.profId).catch(()=>null) : null;
      const minhasTurmas = user.turmas?.length ? user.turmas : (prof?.turmas || []);
      const minhasDisc = user.disciplinas?.length ? user.disciplinas : (prof?.disciplinas || []);
      if (minhasTurmas.length) turmasOpts = turmasOpts.filter(t => minhasTurmas.includes(t.id));
      if (minhasDisc.length) discOpts = discOpts.filter(d => minhasDisc.includes(d.id));
    }
  }

  const s = document.getElementById("serie");
  const d = document.getElementById("disciplina");

  if (s) {
    s.innerHTML = turmasOpts.length
      ? turmasOpts.map(t => `<option value="${t.id}">${t.nome}</option>`).join("")
      : '<option value="">Sem turmas vinculadas</option>';
  }

  if (d) {
    d.innerHTML = discOpts.length
      ? discOpts.map(x => `<option value="${x.id}" data-nome="${x.nome}">${x.codigo || x.id} — ${x.nome}</option>`).join("")
      : '<option value="">Sem disciplinas vinculadas</option>';
  }

  // Ao trocar a turma, o professor só recebe as disciplinas daquela turma.
  if (s && user && user.perfil === "Professor") {
    s.onchange = () => atualizarDisciplinasPorTurma();
    atualizarDisciplinasPorTurma();
  }
}

function atualizarDisciplinasPorTurma() {
  const s = document.getElementById("serie");
  const d = document.getElementById("disciplina");
  if (!s || !d || !user || user.perfil !== "Professor") return;

  const turmaId = s.value;
  const vinculos = window.professorVinculos || [];
  const ids = [...new Set(vinculos.filter(v => v.turmaId === turmaId).map(v => v.disciplinaId))];

  // Se existem vínculos explícitos, filtra pela turma.
  if (vinculos.length) {
    const atual = d.value;
    const opts = ids.map(id => {
      const x = discMap[id];
      return x ? `<option value="${x.id}" data-nome="${x.nome}">${x.codigo || x.id} — ${x.nome}</option>` : "";
    }).join("");
    d.innerHTML = opts || '<option value="">Nenhuma disciplina vinculada a esta turma</option>';
    if (ids.includes(atual)) d.value = atual;
  }
}

async function carregarDiario() {
  const corpo = document.getElementById("corpoNotas");
  if (corpo) corpo.innerHTML = `<tr><td colspan="20" class="loading"><span class="spinner"></span> Carregando diário...</td></tr>`;

  const turma = (document.getElementById("serie") || {}).value;
  const discId = (document.getElementById("disciplina") || {}).value;
  if (!turma || !discId) {
    if (corpo) corpo.innerHTML = `<tr><td colspan="20" class="loading">Selecione turma e disciplina. Se estiver vazio, peça à Secretaria para vincular seu usuário.</td></tr>`;
    return;
  }

  atualizarTitulo();

  const ano = (document.getElementById("anoLetivo") || {}).value || ANO_LETIVO;
  const bim = (document.getElementById("bimestre") || {}).value || "2";

  // Cargas em paralelo (mais rapido)
  const pathBase = pathD();
  const [alvaraOk, allAlunos, dataDiario, dataFreq] = await Promise.all([
    verificarAlvara(ano, bim).catch(() => true),
    fbGet(PATH.alunos).catch(() => ({})),
    fbGet(pathBase + "/diario").catch(() => null),
    fbGet(pathBase + "/frequencia").catch(() => ({}))
  ]);

  diarioAberto = alvaraOk !== false;
  if (!diarioAberto && user && user.perfil === "Professor") {
    toast("Alvara FECHADO para este bimestre. Consulta liberada; lancamento de avaliacoes livres bloqueado.", "info");
  }

  let alunosTurma = Object.values(allAlunos || {}).filter(a =>
    a.turma === turma && a.status !== "Transferido" && a.homologado !== false
  ).sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { sensitivity: "base" }));

  if (!alunosTurma.length) {
    alunos = [];
    if (corpo) corpo.innerHTML = `<tr><td colspan="20" class="loading">Nenhum aluno homologado nesta turma. Cadastre/homologue na Secretaria.</td></tr>`;
    const st = document.getElementById("statusConexao");
    if (st) st.innerHTML = '<span class="dot dot-local"></span>Sem alunos';
    return;
  }

  try {
    const data = dataDiario;
    if (data && data.alunos) {
      if (data.colunasLivres && data.colunasLivres.length) colunasLivres = data.colunasLivres;
      const map = data.alunos;
      alunos = alunosTurma.map(a => {
        const s = map[a.id] || {};
        return {
          id: a.id,
          nome: a.nome,
          livres: s.livres || {},
          bloco: parseNota(s.bloco),
          recuperacao: parseNota(s.recuperacao),
          faltas: parseInt(s.faltas) || 0,
          blocoOrigem: data.blocoInjetadoPor || null
        };
      });
      const st = document.getElementById("statusConexao");
      if (st) st.innerHTML = '<span class="dot dot-online"></span>Diario · ' + alunos.length + ' alunos'
        + (data.blocoInjetadoEm ? ' · Bloco injetado' : '');
    } else {
      alunos = alunosTurma.map(a => ({
        id: a.id, nome: a.nome, livres: {}, bloco: null, recuperacao: null, faltas: 0
      }));
      await importarBlocoExistente(ano, turma, (getDiarioCtx().discId || discId), bim);
      const st = document.getElementById("statusConexao");
      if (st) st.innerHTML = '<span class="dot dot-local"></span>Diario em elaboracao';
    }
    frequencias = dataFreq || {};
    if (frequencias && Object.keys(frequencias).length) {
      const contagem = {};
      alunos.forEach(a => { contagem[a.id] = 0; });
      Object.keys(frequencias).forEach(dia => {
        const mapa = frequencias[dia] || {};
        Object.keys(mapa).forEach(aid => {
          if (mapa[aid] === "F") contagem[aid] = (contagem[aid] || 0) + 1;
        });
      });
      alunos.forEach(a => { a.faltas = contagem[a.id] || 0; });
    }
  } catch (e) {
    alunos = alunosTurma.map(a => ({
      id: a.id, nome: a.nome, livres: {}, bloco: null, recuperacao: null, faltas: 0
    }));
    await importarBlocoExistente(ano, turma, (getDiarioCtx().discId || discId), bim);
    const st = document.getElementById("statusConexao");
    if (st) st.innerHTML = '<span class="dot dot-offline"></span>' + (e.message || "offline");
  }

  renderNotas();
}

async function importarBlocoExistente(ano, turma, discId, bim) {
  try {
    const key = `${ano}_${turma}_${slug(discId)}_b${bim}`;
    const bloco = await fbGet(PATH.blocos + "/" + key);
    if (bloco && bloco.notas) {
      alunos.forEach(a => {
        if (bloco.notas[a.id] != null) a.bloco = bloco.notas[a.id];
      });
      toast("Notas de Bloco desta disciplina importadas automaticamente.", "info");
    }
  } catch (e) {}
}

function atualizarTitulo() {
  const s = document.getElementById("serie");
  const d = document.getElementById("disciplina");
  const b = document.getElementById("bimestre");
  const el = document.getElementById("tituloTurma");
  if (el && s && d && b) {
    el.textContent = `${s.selectedOptions[0]?.text || ""} · ${d.selectedOptions[0]?.text || ""} · ${b.selectedOptions[0]?.text || ""}`;
  }
  const anoTopo = document.getElementById("anoTopo");
  if (anoTopo) {
    anoTopo.textContent = ((document.getElementById("anoLetivo") || {}).value || ANO_LETIVO) + "/" + ((document.getElementById("bimestre") || {}).value || "2");
  }
}

function renderNotas() {
  const thead = document.getElementById("cabecalhoNotas");
  const corpo = document.getElementById("corpoNotas");
  if (!thead || !corpo) return;

  const n = colunasLivres.length;
  const bloqueado = !diarioAberto && user && user.perfil === "Professor";
  const disAttr = bloqueado ? "disabled" : "";

  let h = `<tr>
    <th rowspan="2">Nº</th><th rowspan="2">Aluno</th>
    <th colspan="${n}" class="sub">Métodos do Professor (60%)</th>
    <th rowspan="2" class="bloco-destaque">Av. Bloco<br><small>(40%)</small></th>
    <th rowspan="2">Média Bim.</th><th rowspan="2">Rec.</th><th rowspan="2">Faltas</th>
    <th rowspan="2">Média Final</th><th rowspan="2">Status</th>
  </tr><tr>`;
  colunasLivres.forEach(c => {
    h += `<th class="sub th-livre">${c}
      ${bloqueado ? "" : `<button class="btn-rm-col" onclick="rmColuna('${String(c).replace(/'/g, "\\'")}')">×</button>`}
    </th>`;
  });
  h += "</tr>";
  thead.innerHTML = h;

  if (!alunos.length) {
    corpo.innerHTML = `<tr><td colspan="${9 + n}" class="loading">Sem alunos.</td></tr>`;
    return;
  }

  corpo.innerHTML = alunos.map((a, i) => {
    if (!a.livres) a.livres = {};
    const mb = mediaBimestral(a, colunasLivres);
    const mf = mediaFinal(a, colunasLivres);
    const st = statusMedia(mf);
    const cls = mf == null ? "" : (mf >= 6 ? "media-alta" : "media-baixa");
    // Bloco: professor não edita se veio injetado — só leitura visual (pode editar se for o próprio lançamento livre de bloco em casos especiais)
    // Regra: coluna bloco é readonly para professor (vem do módulo Bloco)
    const blocoRO = user && user.perfil === "Professor" ? "readonly" : "";
    const inputs = colunasLivres.map(c =>
      `<td><input class="nota" type="number" min="0" max="10" step="0.1" ${disAttr}
        value="${a.livres[c] != null ? a.livres[c] : ""}"
        onchange="updNota('${a.id}','livre','${String(c).replace(/'/g, "\\'")}',this.value)" /></td>`
    ).join("");
    return `<tr data-id="${a.id}">
      <td class="num">${i + 1}</td>
      <td class="aluno">${a.nome}</td>
      ${inputs}
      <td><input class="nota" type="number" min="0" max="10" step="0.1"
        value="${a.bloco ?? ""}" ${blocoRO}
        title="Nota da Prova de Bloco desta disciplina (injetada pelo módulo Bloco)"
        style="border-color:#1565c0;background:${blocoRO ? "#eef5fc" : "#fff"}"
        onchange="updNota('${a.id}','bloco',null,this.value)" /></td>
      <td class="${cls}" data-mb>${fmtNota(mb)}</td>
      <td><input class="nota" type="number" min="0" max="10" step="0.1" ${disAttr}
        value="${a.recuperacao ?? ""}"
        onchange="updNota('${a.id}','rec',null,this.value)" /></td>
      <td><input class="nota faltas-input" type="number" min="0" max="50" ${disAttr}
        value="${a.faltas || 0}"
        onchange="updNota('${a.id}','faltas',null,this.value)" /></td>
      <td class="${cls}" data-mf>${fmtNota(mf)}</td>
      <td class="${st.c}" data-st>${st.t}</td>
    </tr>`;
  }).join("");
}

function updNota(id, tipo, col, val) {
  const a = alunos.find(x => x.id == id);
  if (!a) return;
  if (tipo === "livre") {
    if (!a.livres) a.livres = {};
    a.livres[col] = parseNota(val);
  } else if (tipo === "bloco") {
    a.bloco = parseNota(val);
  } else if (tipo === "rec") {
    a.recuperacao = parseNota(val);
  } else if (tipo === "faltas") {
    a.faltas = parseInt(val) || 0;
  }
  const tr = document.querySelector(`tr[data-id="${id}"]`);
  if (!tr) return;
  const mb = mediaBimestral(a, colunasLivres);
  const mf = mediaFinal(a, colunasLivres);
  const st = statusMedia(mf);
  const cls = mf == null ? "" : (mf >= 6 ? "media-alta" : "media-baixa");
  const mbEl = tr.querySelector("[data-mb]");
  const mfEl = tr.querySelector("[data-mf]");
  const stEl = tr.querySelector("[data-st]");
  if (mbEl) { mbEl.textContent = fmtNota(mb); mbEl.className = cls; }
  if (mfEl) { mfEl.textContent = fmtNota(mf); mfEl.className = cls; }
  if (stEl) { stEl.textContent = st.t; stEl.className = st.c; }
}

function abrirModalColuna() {
  if (!diarioAberto && user && user.perfil === "Professor") {
    toast("Diário fechado pela Coordenação. Não é possível adicionar métodos.", "erro");
    return;
  }
  document.getElementById("modalColuna").classList.add("aberto");
  document.getElementById("nomeColuna").value = "";
  document.getElementById("nomeColuna").focus();
}
function fecharModalColuna() {
  document.getElementById("modalColuna").classList.remove("aberto");
}
function addColuna() {
  const nome = document.getElementById("nomeColuna").value.trim();
  if (!nome) { toast("Informe o nome do método.", "erro"); return; }
  if (colunasLivres.includes(nome)) { toast("Já existe.", "erro"); return; }
  colunasLivres.push(nome);
  alunos.forEach(a => { if (!a.livres) a.livres = {}; a.livres[nome] = null; });
  fecharModalColuna();
  renderNotas();
  toast(`Método "${nome}" adicionado (compõe 60%).`, "sucesso");
}
function rmColuna(nome) {
  if (colunasLivres.length <= 1) { toast("Mantenha ao menos um método de avaliação.", "erro"); return; }
  siapConfirmar('Deseja remover o método "' + nome + '"?', "Remover método").then(ok => {
    if (!ok) return;
    colunasLivres = colunasLivres.filter(c => c !== nome);
    alunos.forEach(a => { if (a.livres) delete a.livres[nome]; });
    renderNotas();
    toast("Método removido.", "info");
  });
}

async function salvarNotas() {
  if (!diarioAberto && user && user.perfil === "Professor") {
    toast("Alvará fechado. Não é possível salvar avaliações livres.", "erro");
    return;
  }
  const btn = document.getElementById("btnSalvarNotas");
  if (btn) btn.disabled = true;

  const payload = {
    colunasLivres,
    alunos: {},
    atualizadoEm: agoraISO(),
    professor: user?.nome || ""
  };
  alunos.forEach(a => {
    const mb = mediaBimestral(a, colunasLivres);
    const mf = mediaFinal(a, colunasLivres);
    const st = statusMedia(mf);
    payload.alunos[a.id] = {
      nome: a.nome,
      livres: a.livres || {},
      bloco: a.bloco,
      recuperacao: a.recuperacao,
      faltas: a.faltas || 0,
      media_bimestral: mb != null ? +mb.toFixed(2) : null,
      media_final: mf != null ? +mf.toFixed(2) : null,
      status: st.t
    };
  });

  try {
    await fbPut(pathD() + "/diario", payload);
    await fbPut(pathD() + "/logs/" + Date.now(), {
      acao: "salvar_notas", professor: user?.nome, qtd: alunos.length, ts: agoraISO()
    });
    const st = document.getElementById("statusConexao");
    if (st) st.innerHTML = '<span class="dot dot-online"></span>Registro gravado';
    toast("Notas registradas com sucesso.", "sucesso");
  } catch (e) {
    toast("Não foi possível gravar: " + e.message, "erro");
  }
  if (btn) { btn.disabled = false; btn.textContent = "Salvar Notas"; }
}

function exportNotas() {
  const headers = ["Nº", "Aluno", ...colunasLivres, "Bloco", "Média Bim", "Rec", "Faltas", "Média Final", "Status"];
  const rows = alunos.map((a, i) => {
    const mb = mediaBimestral(a, colunasLivres);
    const mf = mediaFinal(a, colunasLivres);
    return [
      i + 1, a.nome,
      ...colunasLivres.map(c => a.livres?.[c] ?? ""),
      a.bloco ?? "", fmtNota(mb), a.recuperacao ?? "", a.faltas || 0, fmtNota(mf), statusMedia(mf).t
    ];
  });
  exportarCSV("notas_diario.csv", headers, rows);
}

function montarCal() {
  const cont = document.getElementById("calendarioFreq");
  if (!cont) return;
  const ano = anoCal, mes = mesCal;
  const dias = new Date(ano, mes + 1, 0).getDate();
  const primeiro = new Date(ano, mes, 1).getDay();
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const tit = document.getElementById("calTitulo");
  if (tit) tit.textContent = meses[mes] + " " + ano;

  // nav
  let nav = document.getElementById("freqMesNav");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "freqMesNav";
    nav.className = "freq-mes-nav";
    cont.parentNode.insertBefore(nav, cont);
  }
  nav.innerHTML = `<button type="button" onclick="mudarMes(-1)">‹</button>
    <strong>${meses[mes]} ${ano}</strong>
    <button type="button" onclick="mudarMes(1)">›</button>`;

  cont.innerHTML = "";
  ["D","S","T","Q","Q","S","S"].forEach(l => {
    const h = document.createElement("div");
    h.className = "dow";
    h.textContent = l;
    cont.appendChild(h);
  });
  for (let i = 0; i < primeiro; i++) {
    const empty = document.createElement("div");
    empty.className = "dia-freq outro-mes";
    cont.appendChild(empty);
  }
  let cadastrados = 0;
  for (let d = 1; d <= dias; d++) {
    const ds = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const div = document.createElement("div");
    const tem = !!frequencias[ds];
    if (tem) cadastrados++;
    div.className = "dia-freq " + (tem ? "realizada" : "nao-realizada");
    div.textContent = d;
    div.title = ds + (tem ? " (cadastrado)" : " (não cadastrado)");
    div.dataset.data = ds;
    div.onclick = () => selDia(ds, div);
    cont.appendChild(div);
  }
  const info = document.getElementById("freqInfo");
  if (info) info.textContent = cadastrados + " dia(s) cadastrado(s) neste mês · navegue pelos meses do ano";
}
function mudarMes(delta) {
  mesCal += delta;
  if (mesCal > 11) { mesCal = 0; anoCal++; }
  if (mesCal < 0) { mesCal = 11; anoCal--; }
  montarCal();
}
function selDia(ds, el) {
  document.querySelectorAll(".dia-freq").forEach(d => d.classList.remove("selecionado"));
  el.classList.add("selecionado");
  diaSel = ds;
  const info = document.getElementById("freqInfo");
  if (info) info.textContent = "Data selecionada: " + ds.split("-").reverse().join("/");
  if (!frequencias[ds]) {
    frequencias[ds] = {};
    alunos.forEach(a => frequencias[ds][a.id] = ".");
  }
  const cont = document.getElementById("listaFreqAlunos");
  if (!cont) return;
  const mapa = frequencias[ds];
  cont.innerHTML = `<p style="font-weight:600;margin-bottom:10px">Data: ${ds.split("-").reverse().join("/")}</p>
    <table><thead><tr><th>Nº</th><th>Aluno</th><th style="text-align:center">Freq.</th></tr></thead>
    <tbody>${alunos.map((a, i) => {
      const s = mapa[a.id] || ".";
      return `<tr><td>${i + 1}</td><td>${a.nome}</td>
        <td style="text-align:center"><span class="simbolo-freq ${s === "F" ? "falta" : "presente"}"
          onclick="altFreq('${a.id}',this)">${s}</span></td></tr>`;
    }).join("")}</tbody></table>`;
}
function altFreq(id, el) {
  if (!diaSel) return;
  const n = (frequencias[diaSel][id] || ".") === "." ? "F" : ".";
  frequencias[diaSel][id] = n;
  el.textContent = n;
  el.className = "simbolo-freq " + (n === "F" ? "falta" : "presente");
}
async function salvarFrequencia() {
  if (!diaSel) { toast("Selecione um dia.", "erro"); return; }
  // Garante que o dia atual está no objeto
  if (!frequencias[diaSel]) {
    frequencias[diaSel] = {};
    alunos.forEach(a => { frequencias[diaSel][a.id] = "."; });
  }
  try {
    // Grava o objeto INTEIRO de frequências (todos os dias) — evita perda ao atualizar
    const pathFreq = pathD() + "/frequencia";
    await fbPut(pathFreq, frequencias);

    // Agrega total de faltas (F) por aluno
    const contagem = {};
    alunos.forEach(a => { contagem[a.id] = 0; });
    Object.keys(frequencias).forEach(dia => {
      const mapa = frequencias[dia] || {};
      Object.keys(mapa).forEach(aid => {
        if (mapa[aid] === "F") contagem[aid] = (contagem[aid] || 0) + 1;
      });
    });
    alunos.forEach(a => { a.faltas = contagem[a.id] || 0; });

    // Atualiza faltas no diário para o boletim (sem apagar notas)
    try {
      const pathDiario = pathD() + "/diario";
      let dataDiario = (await fbGet(pathDiario)) || {};
      if (!dataDiario.alunos) dataDiario.alunos = {};
      alunos.forEach(a => {
        if (!dataDiario.alunos[a.id]) dataDiario.alunos[a.id] = { id: a.id, nome: a.nome };
        dataDiario.alunos[a.id].faltas = a.faltas;
      });
      dataDiario.atualizadoEm = new Date().toISOString();
      await fbPut(pathDiario, dataDiario);
    } catch (e2) {}

    montarCal();
    if (typeof renderNotas === "function") renderNotas();
    toast("Frequência salva (" + Object.keys(frequencias).length + " dia(s)). Dados preservados ao atualizar.", "sucesso");
  } catch (e) { toast("Erro: " + e.message, "erro"); }
}


async function loadPlanejamento() {
  try {
    const data = await fbGet(pathD() + "/planejamento");
    planejamentos = Array.isArray(data) ? data : (data && data.itens ? data.itens : []);
  } catch (e) { planejamentos = []; }
  renderPlanejamento();
}
function renderPlanejamento() {
  const el = document.getElementById("listaPlanejamento");
  if (!el) return;
  if (!planejamentos.length) {
    el.innerHTML = "<p class=\"loading\">Nenhum planejamento salvo ainda.</p>";
    return;
  }
  const ordered = [...planejamentos].sort((a,b) => String(a.data).localeCompare(String(b.data)));
  el.innerHTML = ordered.map((p, i) => `
    <div class="plan-card">
      <h4>${p.data ? p.data.split("-").reverse().join("/") : "—"} · ${p.qtd || 1} aula(s)</h4>
      <p><strong>Conteúdo:</strong> ${p.conteudo || "—"}</p>
      <p><strong>Metodologia:</strong> ${p.metodo || "—"}</p>
      <p><strong>Recursos:</strong> ${p.recursos || "—"}</p>
      <button class="btn btn-aviso btn-sm" onclick="rmPlan(${i})">Remover</button>
    </div>`).join("");
}
async function salvarPlanejamento() {
  const data = (document.getElementById("pl_data") || {}).value;
  const conteudo = ((document.getElementById("pl_conteudo") || {}).value || "").trim();
  if (!data || !conteudo) { toast("Informe data e conteúdo.", "erro"); return; }
  const item = {
    data,
    qtd: parseInt((document.getElementById("pl_qtd") || {}).value) || 1,
    conteudo,
    metodo: ((document.getElementById("pl_metodo") || {}).value || "").trim(),
    recursos: ((document.getElementById("pl_recursos") || {}).value || "").trim(),
    criadoEm: agoraISO(),
    professor: (user && user.nome) || ""
  };
  planejamentos.push(item);
  try {
    await fbPut(pathD() + "/planejamento", { itens: planejamentos, atualizadoEm: agoraISO() });
    toast("Planejamento salvo.", "sucesso");
    ["pl_conteudo","pl_metodo","pl_recursos"].forEach(id => { const e = document.getElementById(id); if (e) e.value = ""; });
    renderPlanejamento();
  } catch (e) { toast("Erro: " + e.message, "erro"); }
}
async function rmPlan(idx) {
  // re-sort index issue: use data from rendered order
  const ordered = [...planejamentos].sort((a,b) => String(a.data).localeCompare(String(b.data)));
  const item = ordered[idx];
  if (!item) return;
  const ok = await siapConfirmar("Deseja remover este planejamento?", "Planejamento");
  if (!ok) return;
  planejamentos = planejamentos.filter(p => p !== item);
  try {
    await fbPut(pathD() + "/planejamento", { itens: planejamentos, atualizadoEm: agoraISO() });
    renderPlanejamento();
    toast("Removido.", "info");
  } catch (e) { toast(e.message, "erro"); }
}

async function loadConteudo() {
  try {
    const t = await fbGet(pathD() + "/conteudo");
    document.getElementById("conteudoAula").value = typeof t === "string" ? t : "";
  } catch (e) {
    document.getElementById("conteudoAula").value = "";
  }
}
async function salvarConteudo() {
  const t = (document.getElementById("conteudoAula") || {}).value || "";
  if (!t.trim()) { toast("Digite o conteúdo.", "erro"); return; }
  try {
    await fbPut(pathD() + "/conteudo", t);
    toast("Conteúdo salvo.", "sucesso");
  } catch (e) { toast("Erro: " + e.message, "erro"); }
}

document.addEventListener("DOMContentLoaded", async () => {
  user = exigirLogin(["Professor", "Gestor", "Coordenacao", "Secretaria"]);
  if (!user) return;
  const ctx = getDiarioCtx();
  if (!ctx.turma || !ctx.discId) {
    location.href = "diario-inicio.html";
    return;
  }
  const topo = document.getElementById("topo");
  if (topo && typeof montarTopo === "function") {
    topo.innerHTML = montarTopo("Diário do Professor", (ctx.discNome || ctx.discId) + " · " + ctx.turma);
  }
  const nu = document.getElementById("nomeUsuario");
  if (nu) nu.textContent = user.nome;
  const dt = document.getElementById("dataTopo");
  if (dt) dt.textContent = dataHoje();

  // Garante área de trabalho visível
  const etapa = document.getElementById("etapaTrabalho");
  if (etapa) etapa.style.display = "block";

  // Preenche filtros ocultos com contexto
  const s = document.getElementById("serie");
  const d = document.getElementById("disciplina");
  const b = document.getElementById("bimestre");
  const a = document.getElementById("anoLetivo");
  const tNome = ctx.turma;
  const dNome = ctx.discNome || ctx.discId;
  if (a) a.value = ctx.ano || ANO_LETIVO;
  if (s) { s.innerHTML = `<option value="${ctx.turma}">${tNome}</option>`; s.value = ctx.turma; }
  if (d) { d.innerHTML = `<option value="${ctx.discId}" data-nome="${dNome}">${dNome}</option>`; d.value = ctx.discId; }
  if (b) b.value = ctx.bim || "2";

  // Rotulo de contexto
  const ctxLabel = document.getElementById("ctxLabel");
  if (ctxLabel) {
    ctxLabel.value = `${tNome} · ${dNome} · ${ctx.bim || "2"} bimestre · ${ctx.ano || ANO_LETIVO}`;
  }
  const banner = document.getElementById("ctxBannerTxt");
  if (banner) {
    const nomesMod = { notas: "Notas", frequencia: "Frequencia", conteudo: "Planejamento" };
    const aba0 = sessionStorage.getItem("siap_diario_aba") || "notas";
    banner.textContent = `${tNome} · ${dNome} · ${ctx.bim || "2"} bim · ${ctx.ano || ANO_LETIVO} · ${nomesMod[aba0] || aba0}`;
  }

  // Modulos SEPARADOS: mostra apenas o escolhido em diario-inicio (sem abas juntas)
  const aba = sessionStorage.getItem("siap_diario_aba") || "notas";
  document.querySelectorAll(".painel").forEach(p => p.style.display = "none");
  const painel = document.getElementById("painel-" + aba);
  if (painel) painel.style.display = "block";

  await carregarDiario();
  if (aba === "frequencia") montarCal();
  if (aba === "conteudo") { loadConteudo(); loadPlanejamento(); }
});
