
/** Lógica compartilhada das páginas da Secretaria */
let C = { turmas: {}, alunos: {}, professores: {}, disciplinas: {}, vinculos: {}, alvaras: {}, antigas: {} };

async function loadCache() {
  try {
    const [t, a, p, d, v, al, ant] = await Promise.all([
      fbGet(PATH.turmas), fbGet(PATH.alunos), fbGet(PATH.professores),
      fbGet(PATH.disciplinas), fbGet(PATH.vinculos), fbGet(PATH.alvaras), fbGet(PATH.turmasAntigas)
    ]);
    C.turmas = t || {}; C.alunos = a || {}; C.professores = p || {};
    C.disciplinas = d || {}; C.vinculos = v || {}; C.alvaras = al || {}; C.antigas = ant || {};
  } catch (e) { toast(e.message + " — use Inicializar no Hub.", "erro"); }
}

function optsTurma(sel) {
  const el = document.getElementById(sel);
  if (el) el.innerHTML = Object.values(C.turmas).map(t => `<option value="${t.id}">${t.nome}</option>`).join("") || "<option>—</option>";
}

async function initPage(page) {
  await loadCache();
  if (page === "turmas") renderTurmas();
  if (page === "alunos") { optsTurma("a_turma"); renderAlunos(); }
  if (page === "matriculas") { optsTurma("m_turma"); renderMat(); }
  if (page === "disciplinas") renderDisc();
  if (page === "vinculos") {
    document.getElementById("v_prof").innerHTML = Object.values(C.professores).map(p => `<option value="${p.id}">${p.nome}</option>`).join("");
    optsTurma("v_turma");
    document.getElementById("v_disc").innerHTML = Object.values(C.disciplinas).map(d => `<option value="${d.id}">${d.codigo||d.id} — ${d.nome}</option>`).join("");
    renderVinc();
  }
  if (page === "movimentacao") {
    document.getElementById("mv_aluno").innerHTML = Object.values(C.alunos).map(a => `<option value="${a.id}">${a.nome} (${a.turma})</option>`).join("");
    optsTurma("mv_destino");
  }
  if (page === "alvaras") renderAlvaras();
  if (page === "antigas") { optsTurma("arq_turma"); renderAntigas(); }
  if (page === "historico") loadHist();
}

// Turmas
function renderTurmas() {
  const tb = document.getElementById("tb"); if (!tb) return;
  const list = Object.values(C.turmas);
  tb.innerHTML = list.map(t => `<tr><td>${t.id}</td><td>${t.nome}</td><td>${t.serie||""}</td><td>${t.turno||""}</td><td>${t.composicao||""}</td>
    <td><button class="btn btn-aviso btn-sm" onclick="delItem('turmas','${t.id}')">Excluir</button></td></tr>`).join("") || "<tr><td colspan='6'>Vazio</td></tr>";
}
async function salvarTurma() {
  const id = document.getElementById("t_id").value.trim();
  if (!id) return toast("Código obrigatório", "erro");
  const obj = { id, nome: document.getElementById("t_nome").value.trim()||id, serie: document.getElementById("t_serie").value.trim(),
    turno: document.getElementById("t_turno").value, composicao: document.getElementById("t_comp").value, ano: 2026, ativa: true };
  C.turmas[id] = obj;
  try { await fbPut(PATH.turmas+"/"+id, obj); await registrarHistorico("turma","Turma "+id,obj); toast("Salva","sucesso"); } catch(e){ toast(e.message,"erro"); }
  renderTurmas();
}
function expTurmas() {
  exportarCSV("turmas_2026.csv",["Código","Nome","Série","Turno","Composição"], Object.values(C.turmas).map(t=>[t.id,t.nome,t.serie,t.turno,t.composicao]));
}

// Alunos
function renderAlunos() {
  const tb = document.getElementById("tb"); if (!tb) return;
  tb.innerHTML = Object.values(C.alunos).map(a => `<tr>
    <td>${a.matricula||a.id}</td><td>${a.nome}</td><td>${a.turma}</td>
    <td><span class="badge-status ${a.status==="Normal"?"badge-normal":a.status==="Pendente"?"badge-pendente":"badge-transf"}">${a.status}</span></td>
    <td>${a.homologado?"Sim":"Não"}</td>
    <td><button class="btn btn-aviso btn-sm" onclick="delItem('alunos','${a.id}')">Excluir</button></td></tr>`).join("") || "<tr><td colspan='6'>Vazio</td></tr>";
}
async function salvarAluno() {
  const nome = document.getElementById("a_nome").value.trim();
  const mat = document.getElementById("a_mat").value.trim() || ("2026"+Math.floor(Math.random()*9000+1000));
  if (!nome) return toast("Nome obrigatório","erro");
  const id = "a_"+mat.replace(/\W/g,"");
  const st = document.getElementById("a_status").value;
  const obj = { id, nome: nome.toUpperCase(), matricula: mat, turma: document.getElementById("a_turma").value,
    status: st, sexo: document.getElementById("a_sexo").value, nCham: parseInt(document.getElementById("a_cham").value)||0,
    ano: 2026, homologado: st==="Normal" };
  C.alunos[id] = obj;
  try { await fbPut(PATH.alunos+"/"+id, obj); toast("Salvo","sucesso"); } catch(e){ toast(e.message,"erro"); }
  renderAlunos();
}
function expAlunos() {
  exportarCSV("alunos_2026.csv",["Matrícula","Nome","Turma","Status"], Object.values(C.alunos).map(a=>[a.matricula,a.nome,a.turma,a.status]));
}

// Matrículas
function renderMat() {
  const tb = document.getElementById("tb"); if (!tb) return;
  tb.innerHTML = Object.values(C.alunos).map(a => `<tr>
    <td>${a.matricula}</td><td>${a.nome}</td><td>${a.turma}</td>
    <td><span class="badge-status ${a.status==="Normal"?"badge-normal":"badge-pendente"}">${a.status}</span></td>
    <td>${!a.homologado?`<button class="btn btn-sucesso btn-sm" onclick="homologar('${a.id}')">Homologar</button>`:"—"}</td>
  </tr>`).join("");
}
async function matricular() {
  const nome = document.getElementById("m_nome").value.trim();
  if (!nome) return toast("Nome obrigatório","erro");
  const mat = document.getElementById("m_mat").value.trim() || ("2026"+Math.floor(Math.random()*9000+1000));
  const id = "a_"+mat.replace(/\W/g,"");
  const obj = { id, nome: nome.toUpperCase(), matricula: mat, turma: document.getElementById("m_turma").value,
    status: "Pendente", sexo: document.getElementById("m_sexo").value, ano: 2026, homologado: false, matriculadoEm: agoraISO() };
  C.alunos[id] = obj;
  try { await fbPut(PATH.alunos+"/"+id, obj); await registrarHistorico("matricula","Matrícula "+nome,obj); toast("Matriculado (pendente)","sucesso"); } catch(e){ toast(e.message,"erro"); }
  document.getElementById("m_nome").value = "";
  renderMat();
}
async function homologar(id) {
  const a = C.alunos[id]; if (!a) return;
  a.homologado = true; a.status = "Normal";
  try { await fbPut(PATH.alunos+"/"+id, a); await registrarHistorico("homologacao","Homologou "+a.nome,{id}); toast("Homologado","sucesso"); } catch(e){}
  renderMat();
}

// Disciplinas
function renderDisc() {
  const tb = document.getElementById("tb"); if (!tb) return;
  tb.innerHTML = Object.values(C.disciplinas).map(d => `<tr>
    <td>${d.id}</td><td>${d.codigo||""}</td><td>${d.nome}</td><td>${d.area||""}</td><td>${d.carga||""}</td>
    <td><button class="btn btn-aviso btn-sm" onclick="delItem('disciplinas','${d.id}')">Excluir</button></td></tr>`).join("") || "<tr><td colspan='6'>Vazio</td></tr>";
}
async function salvarDisc() {
  const id = document.getElementById("d_id").value.trim().toUpperCase();
  const nome = document.getElementById("d_nome").value.trim();
  if (!id||!nome) return toast("ID e nome obrigatórios","erro");
  const obj = { id, codigo: document.getElementById("d_codigo").value.trim(), nome,
    area: document.getElementById("d_area").value.trim(), carga: parseInt(document.getElementById("d_carga").value)||2 };
  C.disciplinas[id] = obj;
  try { await fbPut(PATH.disciplinas+"/"+id, obj); toast("Salva","sucesso"); } catch(e){ toast(e.message,"erro"); }
  renderDisc();
}
function expDisc() {
  exportarCSV("disciplinas.csv",["ID","Código","Nome","Área","Carga"], Object.values(C.disciplinas).map(d=>[d.id,d.codigo,d.nome,d.area,d.carga]));
}

// Vínculos
function renderVinc() {
  const tb = document.getElementById("tb"); if (!tb) return;
  tb.innerHTML = Object.entries(C.vinculos).map(([id,v]) => {
    const pn = (C.professores[v.professorId]||{}).nome||v.professorId;
    const tn = (C.turmas[v.turmaId]||{}).nome||v.turmaId;
    const dn = (C.disciplinas[v.disciplinaId]||{}).nome||v.disciplinaId;
    return `<tr><td>${pn}</td><td>${tn}</td><td>${dn}</td>
      <td><button class="btn btn-aviso btn-sm" onclick="delItem('vinculos','${id}')">Remover</button></td></tr>`;
  }).join("") || "<tr><td colspan='4'>Vazio</td></tr>";
}
async function salvarVinc() {
  const obj = { professorId: document.getElementById("v_prof").value, turmaId: document.getElementById("v_turma").value,
    disciplinaId: document.getElementById("v_disc").value, ano: 2026 };
  const id = "v_"+uid();
  C.vinculos[id] = obj;
  try { await fbPut(PATH.vinculos+"/"+id, obj); toast("Homologado","sucesso"); } catch(e){ toast(e.message,"erro"); }
  renderVinc();
}

// Movimentação
async function mover() {
  const aid = document.getElementById("mv_aluno").value;
  const op = document.getElementById("mv_op").value;
  const dest = document.getElementById("mv_destino").value;
  const a = C.alunos[aid]; if (!a) return toast("Selecione aluno","erro");
  const origem = a.turma;
  if (op === "efetivacao") { a.status = "Normal"; a.homologado = true; }
  else if (op === "transferencia") { a.status = "Transferido"; a.turmaAnterior = origem; }
  else {
    if (!dest || dest === origem) return toast("Turma destino diferente","erro");
    a.turmaAnterior = origem; a.turma = dest; a.status = op === "remanejar" ? "Remanejado" : "Normal";
  }
  try { await fbPut(PATH.alunos+"/"+aid, a); await registrarHistorico("movimentacao", op+": "+a.nome, {origem, dest: a.turma}); toast("Concluído","sucesso"); } catch(e){ toast(e.message,"erro"); }
}

// Alvarás
function renderAlvaras() {
  for (let b = 1; b <= 4; b++) {
    const k = "2026_"+b;
    if (!C.alvaras[k]) C.alvaras[k] = { ano: 2026, bimestre: b, aberto: false };
  }
  const tb = document.getElementById("tb"); if (!tb) return;
  tb.innerHTML = Object.entries(C.alvaras).sort((a,b)=>a[1].bimestre-b[1].bimestre).map(([k,a]) => `<tr>
    <td>${a.bimestre}º Bimestre</td>
    <td><span class="badge-status ${a.aberto?"badge-aberto":"badge-fechado"}">${a.aberto?"ABERTO":"FECHADO"}</span></td>
    <td>${a.abertoEm?new Date(a.abertoEm).toLocaleString("pt-BR"):"—"}</td>
    <td>${a.por||"—"}</td>
    <td>${a.aberto
      ? `<button class="btn btn-aviso btn-sm" onclick="toggleAlv('${k}',false)">Fechar</button>`
      : `<button class="btn btn-sucesso btn-sm" onclick="toggleAlv('${k}',true)">Abrir</button>`}</td>
  </tr>`).join("");
}
async function toggleAlv(key, abrir) {
  const u = getUser();
  const a = C.alvaras[key] || {};
  a.aberto = abrir; a.por = u?.nome;
  if (abrir) a.abertoEm = agoraISO(); else a.fechadoEm = agoraISO();
  C.alvaras[key] = a;
  try { await fbPut(PATH.alvaras+"/"+key, a); await registrarHistorico("alvara", (abrir?"Abriu":"Fechou")+" bim "+a.bimestre, a); toast("Atualizado","sucesso"); } catch(e){ toast(e.message,"erro"); }
  renderAlvaras();
}

// Antigas
function renderAntigas() {
  const tb = document.getElementById("tb"); if (!tb) return;
  tb.innerHTML = Object.values(C.antigas).map(t => `<tr><td>${t.id}</td><td>${t.nome}</td><td>${t.ano}</td><td>Sim</td></tr>`).join("") || "<tr><td colspan='4'>Nenhuma arquivada</td></tr>";
}
async function arquivar() {
  const tid = document.getElementById("arq_turma").value;
  const ano = parseInt(document.getElementById("arq_ano").value)||2025;
  const t = C.turmas[tid]; if (!t) return toast("Selecione","erro");
  const id = ano+"_"+tid;
  const obj = { ...t, id, ano, ativa: false, arquivada: true };
  C.antigas[id] = obj;
  try { await fbPut(PATH.turmasAntigas+"/"+id, obj); toast("Arquivada","sucesso"); } catch(e){ toast(e.message,"erro"); }
  renderAntigas();
}

// Histórico
async function loadHist() {
  const tb = document.getElementById("tb"); if (!tb) return;
  try {
    const h = (await fbGet(PATH.historico)) || {};
    const list = Object.values(h).sort((a,b)=>(b.timestamp||"").localeCompare(a.timestamp||""));
    tb.innerHTML = list.map(r => `<tr>
      <td>${r.timestamp?new Date(r.timestamp).toLocaleString("pt-BR"):"—"}</td>
      <td>${r.tipo||""}</td><td>${r.descricao||""}</td><td>${r.usuario||""}</td></tr>`).join("") || "<tr><td colspan='4'>Vazio</td></tr>";
  } catch(e) { tb.innerHTML = `<tr><td colspan='4'>${e.message}</td></tr>`; }
}

async function delItem(tipo, id) {
  if (!confirm("Excluir?")) return;
  const map = { turmas: PATH.turmas, alunos: PATH.alunos, disciplinas: PATH.disciplinas, vinculos: PATH.vinculos };
  delete C[tipo][id];
  try { await fbDelete(map[tipo]+"/"+id); } catch(e){}
  if (tipo==="turmas") renderTurmas();
  if (tipo==="alunos") renderAlunos();
  if (tipo==="disciplinas") renderDisc();
  if (tipo==="vinculos") renderVinc();
  toast("Excluído","info");
}
