'use strict';

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fdate = iso => (iso ? iso.split('-').reverse().join('/') : '—');
const fdatahora = (iso, hora) => (iso ? `${fdate(iso)}${hora ? ' às ' + hora : ''}` : '—');
const pad2 = n => String(n).padStart(2, '0');
const pad4 = n => String(n).padStart(4, '0');
const onlyDigits = s => String(s ?? '').replace(/\D/g, '');
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const casa = (q, ...campos) => {
  if (!q) return true;
  const qd = onlyDigits(q);
  const soNumeros = qd.length >= 3 && /^[\d\s.\-/()]+$/.test(q); /* achar CPF, CNPJ e telefone digitando só os números */
  return campos.some(c => norm(c).includes(norm(q)) || (soNumeros && onlyDigits(c).includes(qd)));
};
const STATUS = DB.STATUS;
const rotulo = (lista, k) => (lista.find(s => s.key === k) || {}).label || k;
const statusLabel = k => rotulo(STATUS, k);
const badge = (k, label) => `<span class="badge" data-s="${esc(k)}">${esc(label || statusLabel(k))}</span>`;
const badgeOrc = k => badge(k, rotulo(DB.ORC_STATUS, k));
const vazio = msg => `<div class="empty"><p>${esc(msg)}</p></div>`;

function placaTxt(p) { return /^[A-Z]{3}\d{4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p; }
function plate(placa, grande = false) {
  const antiga = /^[A-Z]{3}\d{4}$/.test(placa);
  return `<span class="plate${antiga ? ' antiga' : ''}${grande ? ' lg' : ''}" role="img" aria-label="Placa ${esc(placaTxt(placa))}"><i aria-hidden="true">BRASIL</i><b>${esc(placaTxt(placa))}</b></span>`;
}

function cpfValido(c) {
  c = onlyDigits(c);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}
function cnpjValido(c) {
  c = onlyDigits(c);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [12, 13]) {
    let s = 0, peso = t - 7;
    for (let i = 0; i < t; i++) { s += Number(c[i]) * peso; peso = peso === 2 ? 9 : peso - 1; }
    const dv = s % 11 < 2 ? 0 : 11 - (s % 11);
    if (dv !== Number(c[t])) return false;
  }
  return true;
}
const docValido = v => cpfValido(v) || cnpjValido(v);
function fmtDoc(v) {
  const d = onlyDigits(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return v;
}

let toastTimer;
function toast(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (erro ? ' erro' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 3800);
}

/* ---------- Sessão e permissões ---------- */
const TODOS_STATUS = STATUS.map(x => x.key);
/* Ajuste aqui o que cada perfil pode fazer. */
const PERMS = {
  administrador: { paginas: ['painel', 'os', 'orcamentos', 'clientes', 'veiculos', 'servicos', 'pecas', 'usuarios'], editar: ['clientes', 'veiculos', 'servicos', 'pecas', 'usuarios'], orcamentos: true, novaOS: true, excluirOS: true, desconto: true, atribuir: true, financeiro: true, status: TODOS_STATUS, valores: true, receber: true, restaurar: true },
  atendente: { paginas: ['painel', 'os', 'orcamentos', 'clientes', 'veiculos', 'pecas'], editar: ['clientes', 'veiculos', 'pecas'], orcamentos: true, novaOS: true, excluirOS: false, desconto: true, atribuir: true, financeiro: false, valores: true, receber: true, status: TODOS_STATUS, restaurar: false },
  mecanico: { paginas: ['painel', 'os', 'pecas'], editar: [], orcamentos: false, novaOS: false, excluirOS: false, desconto: false, atribuir: false, financeiro: false, valores: false, receber: false, status: ['pendente', 'em_andamento', 'aguardando_peca', 'concluida'], restaurar: false }
};
const SESSAO_KEY = 'oficinagest.sessao';
const IDLE_MS = 30 * 60 * 1000; /* encerra a sessão após 30 minutos sem uso */
let sessao = null;
let idleTimer = null;
const perm = () => PERMS[sessao.perfil];
const pode = t => perm().editar.includes(t);
const perfilLabel = k => rotulo(DB.PERFIS, k);

function lerSessao() {
  try {
    const id = sessionStorage.getItem(SESSAO_KEY);
    const u = id && DB.get('usuarios', id);
    if (u && u.ativo) return { id: u.id, nome: u.nome, perfil: u.perfil };
  } catch (e) { /* sem sessionStorage */ }
  return null;
}
function gravarSessao(u) {
  try { if (u) sessionStorage.setItem(SESSAO_KEY, u.id); else sessionStorage.removeItem(SESSAO_KEY); } catch (e) { /* ignora */ }
}

function reiniciarInatividade() {
  clearTimeout(idleTimer);
  if (sessao) idleTimer = setTimeout(() => sair('Sessão encerrada após 30 minutos sem atividade. Entre novamente.'), IDLE_MS);
}
['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, reiniciarInatividade, { passive: true }));

function telaLogin(msg = '') {
  document.querySelector('.shell').hidden = true;
  document.title = 'Entrar | OficinaGest';
  $('#modal-root').innerHTML = '';
  $('#login-root').innerHTML = `<main class="login"><form class="login-card" id="form-login" novalidate>
    <div class="login-brand"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>OficinaGest</span></div>
    <h1>Entrar</h1>
    <p class="sub">Use o usuário e a senha fornecidos pelo administrador da oficina.</p>
    <div class="field"><label for="l_login">Usuário</label><input id="l_login" name="login" autocomplete="username" autocapitalize="none" spellcheck="false"></div>
    <div class="field"><label for="l_senha">Senha</label><input id="l_senha" name="senha" type="password" autocomplete="current-password"></div>
    <p class="form-err" id="l_err" role="alert">${esc(msg)}</p>
    <button type="submit" class="btn primary">Entrar</button>
    <details class="demo"><summary>Contas de demonstração</summary>
      <table><thead><tr><th>Perfil</th><th>Usuário</th><th>Senha</th></tr></thead><tbody>
        <tr><td>Administrador</td><td>admin</td><td>admin123</td></tr>
        <tr><td>Atendente</td><td>atendente</td><td>atendente123</td></tr>
        <tr><td>Mecânico</td><td>carlos</td><td>mecanico123</td></tr>
      </tbody></table></details>
  </form></main>`;
  $('#form-login').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    if (!f.login.value.trim() || !f.senha.value) return ($('#l_err').textContent = 'Informe o usuário e a senha.');
    const u = DB.autenticar(f.login.value, f.senha.value);
    if (!u) { f.senha.value = ''; f.senha.focus(); return ($('#l_err').textContent = 'Usuário ou senha incorretos.'); }
    gravarSessao(u);
    location.hash = '#/painel';
    iniciar();
  });
  $('#l_login').focus();
}

function sair(msg) {
  clearTimeout(idleTimer);
  gravarSessao(null);
  sessao = null;
  telaLogin(typeof msg === 'string' ? msg : '');
}

function atualizarMenu() {
  const pg = perm().paginas;
  document.querySelectorAll('.nav a').forEach(a => { a.hidden = !pg.includes(a.dataset.page); });
  $('#user-box').innerHTML = `<strong>${esc(sessao.nome)}</strong><span>${esc(perfilLabel(sessao.perfil))}</span><button type="button" class="link-light" data-act="sair">Sair</button>`;
  $('#btn-restaurar').hidden = !perm().restaurar;
}

/* ---------- Modal e formulários ---------- */
let focoAnterior = null;
function closeModal() {
  $('#modal-root').innerHTML = '';
  if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
}

const optsHtml = (opts, sel, placeholder) =>
  `<option value="">${esc(placeholder || 'Selecione…')}</option>` +
  opts.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(sel) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');

function fieldHtml(f, val) {
  const id = 'f_' + f.name;
  const v = val ?? f.default ?? '';
  let ctl;
  if (f.type === 'select') {
    const opts = (typeof f.options === 'function' ? f.options() : f.options) || [];
    ctl = `<select id="${id}" name="${f.name}">${optsHtml(opts, v, f.placeholder)}</select>`;
  } else if (f.type === 'textarea') {
    ctl = `<textarea id="${id}" name="${f.name}" rows="3">${esc(v)}</textarea>`;
  } else {
    ctl = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}"` +
      (f.step ? ` step="${f.step}"` : '') + (f.min !== undefined ? ` min="${f.min}"` : '') +
      (f.maxlength ? ` maxlength="${f.maxlength}"` : '') + ' autocomplete="off">';
  }
  return `<div class="field${f.full ? ' col-2' : ''}"><label for="${id}">${esc(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>${ctl}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
}

function openForm({ title, fields, values = {}, submitLabel = 'Salvar', onSave, onChange }) {
  focoAnterior = document.activeElement;
  $('#modal-root').innerHTML = `<div class="overlay"><form class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" novalidate>
    <h2 id="modal-title">${esc(title)}</h2>
    <div class="grid">${fields.map(f => fieldHtml(f, values[f.name])).join('')}</div>
    <p class="form-err" id="form-err" role="alert"></p>
    <div class="actions"><button type="button" class="btn ghost" data-act="fechar">Cancelar</button><button type="submit" class="btn primary">${esc(submitLabel)}</button></div>
  </form></div>`;
  const form = $('#modal-root form');
  const showErr = m => { $('#form-err').textContent = m; };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const vals = {};
    fields.forEach(f => { vals[f.name] = form.elements[f.name].value.trim(); });
    const faltam = fields.filter(f => f.required && vals[f.name] === '').map(f => f.label);
    if (faltam.length) return showErr('Preencha: ' + faltam.join(', ') + '.');
    const err = onSave(vals);
    if (err) return showErr(err);
    closeModal();
  });
  if (onChange) form.addEventListener('change', e => onChange(form, e));
  const primeiro = form.querySelector('input, select, textarea');
  if (primeiro) primeiro.focus();
}

/* ---------- Entidades com cadastro simples ---------- */
const clienteOpts = (todos = false) => DB.list('clientes').filter(c => todos || c.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(c => ({ value: c.id, label: c.nome + (c.ativo ? '' : ' (inativo)') }));
const veiculosOpts = cid => (cid ? DB.list('veiculos').filter(v => v.cliente_id === Number(cid)).map(v => ({ value: v.id, label: `${placaTxt(v.placa)} – ${v.marca} ${v.modelo}` })) : []);
const inteiro = v => /^\d+$/.test(String(v));

const ENT = {
  clientes: {
    titulos: { novo: 'Novo cliente', editar: 'Editar cliente', ok: 'Cliente salvo.' },
    defaults: { ativo: true },
    fields: [
      { name: 'nome', label: 'Nome ou razão social', required: true, full: true },
      { name: 'cpf_cnpj', label: 'CPF ou CNPJ', required: true },
      { name: 'telefone', label: 'Telefone com DDD', required: true },
      { name: 'email', label: 'E-mail', type: 'email', full: true },
      { name: 'endereco', label: 'Endereço', full: true }
    ],
    validate(v, id) {
      if (!docValido(v.cpf_cnpj)) return 'CPF ou CNPJ inválido (confira os dígitos verificadores).';
      if (DB.list('clientes').some(c => c.id !== id && onlyDigits(c.cpf_cnpj) === onlyDigits(v.cpf_cnpj))) return 'Já existe um cliente com este CPF/CNPJ.';
      const tel = onlyDigits(v.telefone);
      if (tel.length < 10 || tel.length > 11) return 'O telefone deve ter DDD mais 8 ou 9 dígitos.';
      if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) return 'E-mail inválido.';
    },
    normalize: v => ({ ...v, cpf_cnpj: fmtDoc(v.cpf_cnpj) })
  },
  veiculos: {
    titulos: { novo: 'Novo veículo', editar: 'Editar veículo', ok: 'Veículo salvo.' },
    fields: [
      { name: 'cliente_id', label: 'Proprietário', type: 'select', required: true, full: true, options: () => clienteOpts(true) },
      { name: 'placa', label: 'Placa', required: true, maxlength: 8, hint: 'Padrão antigo (ABC-1234) ou Mercosul (ABC1D23).' },
      { name: 'chassi', label: 'Número do chassi', maxlength: 17, hint: 'Opcional. 17 caracteres.' },
      { name: 'marca', label: 'Marca', required: true },
      { name: 'modelo', label: 'Modelo', required: true },
      { name: 'ano', label: 'Ano', type: 'number', min: 1950 },
      { name: 'cor', label: 'Cor' },
      { name: 'km', label: 'Quilometragem', type: 'number', min: 0 }
    ],
    validate(v, id) {
      const placa = v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return 'Placa inválida. Use o formato ABC-1234 ou ABC1D23.';
      if (DB.list('veiculos').some(x => x.id !== id && x.placa === placa)) return 'Já existe um veículo com esta placa.';
      const chassi = v.chassi.toUpperCase();
      if (chassi) {
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(chassi)) return 'Chassi inválido: use 17 caracteres (letras e números, sem I, O e Q).';
        if (DB.list('veiculos').some(x => x.id !== id && x.chassi === chassi)) return 'Já existe um veículo com este chassi.';
      }
      const max = new Date().getFullYear() + 1;
      if (v.ano && (!inteiro(v.ano) || Number(v.ano) < 1950 || Number(v.ano) > max)) return `Ano deve estar entre 1950 e ${max}.`;
      if (v.km && !inteiro(v.km)) return 'A quilometragem deve ser um número inteiro, sem negativos.';
    },
    normalize: v => ({ ...v, cliente_id: Number(v.cliente_id), placa: v.placa.toUpperCase().replace(/[^A-Z0-9]/g, ''), chassi: v.chassi.toUpperCase(), ano: v.ano ? Number(v.ano) : null, km: v.km ? Number(v.km) : 0 })
  },
  servicos: {
    titulos: { novo: 'Novo serviço', editar: 'Editar serviço', ok: 'Serviço salvo.' },
    fields: [
      { name: 'descricao', label: 'Descrição', required: true, full: true },
      { name: 'categoria', label: 'Categoria', type: 'select', required: true, options: DB.CATEGORIAS.map(c => ({ value: c, label: c })) },
      { name: 'valor_padrao', label: 'Valor padrão (R$)', type: 'number', step: '0.01', min: 0, required: true }
    ],
    validate(v, id) {
      if (DB.list('servicos').some(x => x.id !== id && norm(x.descricao) === norm(v.descricao))) return 'Já existe um serviço com esta descrição.';
      if (Number(v.valor_padrao) < 0 || isNaN(Number(v.valor_padrao))) return 'Informe um valor igual ou maior que zero.';
    },
    normalize: v => ({ ...v, valor_padrao: Number(v.valor_padrao) })
  },
  pecas: {
    titulos: { novo: 'Nova peça', editar: 'Editar peça', ok: 'Peça salva.' },
    fields: [
      { name: 'codigo', label: 'Código', required: true },
      { name: 'disponivel', label: 'Situação', type: 'select', required: true, placeholder: 'Selecione…', options: [{ value: 'sim', label: 'Disponível' }, { value: 'nao', label: 'Indisponível (encomendar)' }], hint: 'Peça indisponível só entra na OS como encomenda.' },
      { name: 'descricao', label: 'Descrição', required: true, full: true },
      { name: 'preco_custo', label: 'Preço de custo (R$)', type: 'number', step: '0.01', min: 0 },
      { name: 'preco_venda', label: 'Preço de venda (R$)', type: 'number', step: '0.01', min: 0, required: true }
    ],
    toForm: r => ({ ...r, disponivel: r.disponivel ? 'sim' : 'nao' }),
    validate(v, id) {
      if (DB.list('pecas').some(p => p.id !== id && norm(p.codigo) === norm(v.codigo))) return 'Já existe uma peça com este código.';
      if (isNaN(Number(v.preco_venda)) || Number(v.preco_venda) < 0) return 'Preço de venda inválido.';
      if (v.preco_custo && (isNaN(Number(v.preco_custo)) || Number(v.preco_custo) < 0)) return 'Preço de custo inválido.';
    },
    normalize: v => ({ codigo: v.codigo, descricao: v.descricao, disponivel: v.disponivel === 'sim', preco_custo: Number(v.preco_custo) || 0, preco_venda: Number(v.preco_venda) })
  },
  usuarios: {
    titulos: { novo: 'Novo usuário', editar: 'Editar usuário', ok: 'Usuário salvo.' },
    fields: [
      { name: 'nome', label: 'Nome completo', required: true, full: true },
      { name: 'login', label: 'Usuário de acesso', required: true, hint: 'Letras minúsculas, números, ponto, hífen ou sublinhado.' },
      { name: 'perfil', label: 'Perfil', type: 'select', required: true, options: DB.PERFIS.map(x => ({ value: x.key, label: x.label })) },
      { name: 'senha', label: 'Senha', type: 'password', hint: 'Mínimo de 6 caracteres. Ao editar, deixe em branco para manter a senha atual.' },
      { name: 'ativo', label: 'Situação', type: 'select', required: true, default: 'sim', options: [{ value: 'sim', label: 'Ativo' }, { value: 'nao', label: 'Inativo (sem acesso)' }] }
    ],
    toForm: r => ({ ...r, senha: '', ativo: r.ativo ? 'sim' : 'nao' }),
    validate(v, id) {
      const login = v.login.toLowerCase();
      if (!/^[a-z0-9._-]{3,20}$/.test(login)) return 'Usuário de acesso: de 3 a 20 caracteres, só letras minúsculas, números, ponto, hífen ou sublinhado.';
      if (DB.list('usuarios').some(u => u.id !== id && u.login === login)) return 'Já existe um usuário com este acesso.';
      if ((!id || v.senha) && v.senha.length < 6) return 'A senha deve ter no mínimo 6 caracteres.';
      const fica = v.perfil === 'administrador' && v.ativo === 'sim';
      if (id === sessao.id && !fica) return 'Você não pode desativar nem rebaixar o seu próprio usuário.';
      if (!fica && !DB.list('usuarios').some(u => u.id !== id && u.perfil === 'administrador' && u.ativo)) return 'Mantenha ao menos um administrador ativo.';
    },
    normalize: v => ({ nome: v.nome, login: v.login.toLowerCase(), perfil: v.perfil, ativo: v.ativo === 'sim', senha: v.senha }),
    salvar: (id, d) => DB.salvarUsuario(id, d)
  }
};

function abrirEntidade(t, id) {
  const cfg = ENT[t];
  if (!pode(t)) return toast('Seu perfil não pode alterar este cadastro.', true);
  const reg = id ? DB.get(t, id) : null;
  openForm({
    title: reg ? cfg.titulos.editar : cfg.titulos.novo,
    fields: cfg.fields,
    values: reg ? (cfg.toForm ? cfg.toForm(reg) : reg) : {},
    onSave(v) {
      const err = cfg.validate(v, id);
      if (err) return err;
      const dados = cfg.normalize(v);
      if (cfg.salvar) cfg.salvar(id, dados);
      else if (id) DB.update(t, id, dados);
      else DB.insert(t, { ...(cfg.defaults || {}), ...dados });
      toast(cfg.titulos.ok);
      route();
    }
  });
}

/* ---------- Componentes de tela ---------- */
const acoes = (t, id, extra = '') => (!pode(t) ? '<td></td>' : `<td class="end row-actions">${extra}<button class="link" data-act="editar" data-t="${t}" data-id="${id}">Editar</button><button class="link danger" data-act="excluir" data-t="${t}" data-id="${id}">Excluir</button></td>`);
const busca = {};
let tabelaAtual = null;

function lista({ pagina, titulo, sub, botao, placeholder, fn, extra = '' }) {
  const q = busca[pagina] || '';
  tabelaAtual = { pagina, fn };
  return `<header class="page-head"><div><h1>${esc(titulo)}</h1><p class="sub">${esc(sub)}</p></div>${botao || ''}</header>
  <div class="toolbar"><label class="sr" for="busca">Buscar</label><input id="busca" type="search" placeholder="${esc(placeholder)}" value="${esc(q)}" autocomplete="off">${extra}</div>
  <div id="tabela">${fn(q)}</div>`;
}

const tabela = (cab, linhas) => `<div class="table-wrap"><table><thead><tr>${cab.join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`;
const th = (t, cls = '') => `<th${cls ? ` class="${cls}"` : ''}>${t}</th>`;
const thAcoes = th('<span class="sr">Ações</span>', 'end');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function ultimosMeses(n) {
  const hoje = new Date();
  return Array.from({ length: n }, (_, k) => {
    const x = new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1 - k), 1);
    return { chave: `${x.getFullYear()}-${pad2(x.getMonth() + 1)}`, rotulo: MESES[x.getMonth()] };
  });
}
function grafico(titulo, dados, resumo) {
  const max = Math.max(1, ...dados.map(d => d.valor));
  return `<figure class="grafico"><figcaption>${esc(titulo)}</figcaption>
    <div class="barras" role="img" aria-label="${esc(titulo)}: ${esc(resumo)}">${dados.map(d => `<div class="barra"><span class="v">${esc(d.texto)}</span><i style="height:${Math.max(2, Math.round(d.valor / max * 100))}%"></i><span class="r">${esc(d.rotulo)}</span></div>`).join('')}</div></figure>`;
}
const brlCurto = v => (v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} mil` : String(Math.round(v)));

/* ---------- Telas ---------- */
function viewPainel() {
  const ordens = DB.list('ordens'), P = perm();
  const emAberto = ordens.filter(o => !DB.TRAVADAS.includes(o.status));
  const inicio = inicioPeriodo(periodoMeses);
  const periodoTxt = PERIODOS.find(x => x.v === periodoMeses).l.toLowerCase();
  const noPeriodo = ordens.filter(o => o.status === 'concluida' && (o.data_conclusao || '') >= inicio);
  const fatPeriodo = noPeriodo.reduce((a, o) => a + DB.totais(o).total, 0);
  const aReceber = ordens.filter(o => o.status === 'concluida' && !o.pago_em).reduce((a, o) => a + DB.totais(o).total, 0);
  const concluidas = ms => ordens.filter(o => o.status === 'concluida' && (o.data_conclusao || '').startsWith(ms));
  const faturamento = ms => concluidas(ms).reduce((a, o) => a + DB.totais(o).total, 0);
  const indisponiveis = DB.list('pecas').filter(p => !p.disponivel);
  const aguardando = ordens.filter(o => o.status === 'aguardando_peca').length;
  const encomendas = ordens.flatMap(o => (o.status === 'cancelada' ? [] : DB.pendentes(o).map(i => ({ o, i }))));
  const colunas = ['pendente', 'em_andamento', 'aguardando_peca', 'concluida'];
  const meses = ultimosMeses(Math.max(6, periodoMeses));
  const recente = DB.addDays(DB.today(), -7);

  const card = o => {
    const v = DB.get('veiculos', o.veiculo_id), c = DB.get('clientes', o.cliente_id);
    return `<article class="os-card">
      <div class="os-card-top">${plate(v.placa)}<a class="os-num" href="#/os/${o.id}">OS ${pad4(o.id)}</a></div>
      <p class="os-car">${esc(v.marca)} ${esc(v.modelo)}</p>
      <p class="muted">${esc(c.nome)}</p>
      <p class="os-defect">${esc(o.defeito_relatado)}</p>
      ${DB.pendentes(o).length ? '<p><span class="tag low">Peça encomendada</span></p>' : ''}
      <div class="os-card-foot"><span class="muted">Previsão ${fdate(o.previsao_entrega)}</span>${P.valores ? `<strong>${brl(DB.totais(o).total)}</strong>` : ''}</div>
      <label class="sr" for="st${o.id}">Status da OS ${pad4(o.id)}</label>
      <select id="st${o.id}" class="status-select" data-status-select="${o.id}">${STATUS.map(s => `<option value="${s.key}"${s.key === o.status ? ' selected' : ''}${P.status.includes(s.key) ? '' : ' disabled'}>${esc(s.label)}</option>`).join('')}</select>
    </article>`;
  };

  const g1 = grafico('Veículos atendidos por mês', meses.map(m => { const n = new Set(ordens.filter(o => o.status !== 'cancelada' && o.data_abertura.startsWith(m.chave)).map(o => o.veiculo_id)).size; return { rotulo: m.rotulo, valor: n, texto: String(n) }; }), 'quantidade de veículos distintos com OS aberta em cada mês');
  const g2 = grafico('OS finalizadas por mês', meses.map(m => { const n = concluidas(m.chave).length; return { rotulo: m.rotulo, valor: n, texto: String(n) }; }), 'quantidade de ordens concluídas em cada mês');
  const g3 = P.financeiro ? grafico('Faturamento por mês (R$)', meses.map(m => { const v = faturamento(m.chave); return { rotulo: m.rotulo, valor: v, texto: brlCurto(v) }; }), 'valor das ordens concluídas em cada mês') : '';

  return `<header class="page-head"><div><h1>Painel da oficina</h1><p class="sub">Acompanhe os carros que estão no pátio hoje.</p></div>
    <div class="head-actions no-print"><label class="periodo-label" for="periodo">Período dos indicadores</label><select id="periodo" data-periodo>${PERIODOS.map(x => `<option value="${x.v}"${x.v === periodoMeses ? ' selected' : ''}>${x.l}</option>`).join('')}</select>
    ${P.novaOS ? '<button class="btn primary" data-act="nova-os">Abrir ordem de serviço</button>' : ''}</div></header>
  <dl class="strip">
    <div><dt>Veículos no pátio</dt><dd>${new Set(emAberto.map(o => o.veiculo_id)).size}</dd></div>
    <div><dt>Aguardando peça</dt><dd>${aguardando}</dd></div>
    <div><dt>OS finalizadas (${periodoTxt})</dt><dd>${noPeriodo.length}</dd></div>
    ${P.financeiro ? `<div><dt>Faturamento (${periodoTxt})</dt><dd>${brl(fatPeriodo)}</dd></div><div><dt>A receber (concluídas não pagas)</dt><dd>${brl(aReceber)}</dd></div>` : `<div><dt>Peças indisponíveis</dt><dd>${indisponiveis.length}</dd></div>`}
  </dl>
  <section aria-label="Quadro de ordens de serviço" class="board">
    ${colunas.map(k => { const os = ordens.filter(o => o.status === k && (k !== 'concluida' || o.data_conclusao >= recente)).sort((a, b) => a.data_abertura.localeCompare(b.data_abertura)); return `<div class="col" data-s="${k}"><h2>${esc(statusLabel(k))} <span class="count">${os.length}</span></h2>${k === 'concluida' ? '<p class="muted">Concluídas nos últimos 7 dias</p>' : ''}${os.length ? os.map(card).join('') : '<p class="muted col-empty">Nenhuma OS nesta etapa.</p>'}</div>`; }).join('')}
  </section>
  <section class="graficos" aria-label="Indicadores mensais">${g1}${g2}${g3}</section>
  <section class="lista-painel">
    <h2>Peças encomendadas</h2>
    ${encomendas.length ? `<ul>${encomendas.map(({ o, i }) => { const v = DB.get('veiculos', o.veiculo_id); return `<li><span><strong>${esc(i.descricao)}</strong> <span class="muted">${i.quantidade} un.</span></span><a class="os-num" href="#/os/${o.id}">OS ${pad4(o.id)}, ${esc(placaTxt(v.placa))}</a></li>`; }).join('')}</ul>` : '<p class="muted">Nenhuma peça aguardando chegada.</p>'}
  </section>
  <section class="lista-painel">
    <h2>Peças indisponíveis</h2>
    ${indisponiveis.length ? `<ul>${indisponiveis.map(p => `<li><span><strong>${esc(p.descricao)}</strong> <span class="muted">${esc(p.codigo)}</span></span><span class="tag zero">Indisponível</span></li>`).join('')}</ul>` : '<p class="muted">Todas as peças do catálogo estão disponíveis.</p>'}
  </section>`;
}

function tClientes(q) {
  const rows = DB.list('clientes').filter(c => casa(q, c.nome, c.cpf_cnpj, c.telefone, c.email)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!rows.length) return vazio(q ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado ainda. Cadastre o primeiro para começar.');
  return tabela([th('Cliente'), th('CPF/CNPJ'), th('Contato'), th('Veículos'), thAcoes], rows.map(c => {
    const vs = DB.list('veiculos').filter(v => v.cliente_id === c.id);
    const alternar = pode('clientes') ? `<button class="link" data-act="alternar-cliente" data-id="${c.id}">${c.ativo ? 'Inativar' : 'Reativar'}</button>` : '';
    return `<tr${c.ativo ? '' : ' class="inativo"'}><td><strong>${esc(c.nome)}</strong>${c.ativo ? '' : ' <span class="tag zero">Inativo</span>'}</td><td>${esc(c.cpf_cnpj)}</td><td>${esc(c.telefone)}<br><span class="muted">${esc(c.email)}</span></td><td class="plates">${vs.length ? vs.map(v => plate(v.placa)).join('') : '<span class="muted">Nenhum</span>'}</td>${acoes('clientes', c.id, alternar)}</tr>`;
  }));
}

function tVeiculos(q) {
  const rows = DB.list('veiculos').map(v => ({ v, c: DB.get('clientes', v.cliente_id) }))
    .filter(({ v, c }) => casa(q, v.placa, v.marca, v.modelo, v.chassi, c && c.nome)).sort((a, b) => a.v.placa.localeCompare(b.v.placa));
  if (!rows.length) return vazio(q ? 'Nenhum veículo encontrado para essa busca.' : 'Nenhum veículo cadastrado ainda. Cadastre um cliente e depois o veículo dele.');
  return tabela([th('Placa'), th('Veículo'), th('Proprietário'), th('Ano'), th('Km', 'num'), thAcoes], rows.map(({ v, c }) =>
    `<tr><td><a class="plate-link" href="#/veiculos/${v.id}">${plate(v.placa)}</a></td><td><strong>${esc(v.marca)} ${esc(v.modelo)}</strong><br><span class="muted">${esc(v.cor)}${v.chassi ? ` · chassi ${esc(v.chassi)}` : ''}</span></td><td>${esc(c ? c.nome : '—')}</td><td>${v.ano || '—'}</td><td class="num">${Number(v.km).toLocaleString('pt-BR')}</td>
    <td class="end row-actions"><a class="link" href="#/veiculos/${v.id}">Histórico</a>${perm().novaOS && c && c.ativo ? `<button class="link" data-act="nova-os" data-cliente="${v.cliente_id}" data-veiculo="${v.id}">Abrir OS</button>` : ''}${pode('veiculos') ? `<button class="link" data-act="editar" data-t="veiculos" data-id="${v.id}">Editar</button><button class="link danger" data-act="excluir" data-t="veiculos" data-id="${v.id}">Excluir</button>` : ''}</td></tr>`));
}

function viewVeiculo(id) {
  const v = DB.get('veiculos', id);
  if (!v) return `<div class="empty"><p>Veículo não encontrado.</p><a class="btn ghost" href="#/veiculos">Voltar para a lista</a></div>`;
  const c = DB.get('clientes', v.cliente_id), P = perm();
  const ordens = DB.list('ordens').filter(o => o.veiculo_id === v.id).sort((a, b) => b.id - a.id);
  const orcs = P.orcamentos ? DB.list('orcamentos').filter(o => o.veiculo_id === v.id).sort((a, b) => b.id - a.id) : [];
  const tOS = ordens.length ? tabela([th('OS'), th('Abertura'), th('Problema relatado'), th('Status'), P.valores ? th('Total', 'num') : ''], ordens.map(o =>
    `<tr><td><a class="os-num" href="#/os/${o.id}">${pad4(o.id)}</a></td><td>${fdate(o.data_abertura)}</td><td>${esc(o.defeito_relatado)}</td><td>${badge(o.status)}</td>${P.valores ? `<td class="num">${brl(DB.totais(o).total)}</td>` : ''}</tr>`)) : vazio('Este veículo ainda não tem ordens de serviço.');
  const tOrc = orcs.length ? tabela([th('Nº'), th('Emissão'), th('Serviço solicitado'), th('Situação'), th('Total', 'num')], orcs.map(o =>
    `<tr><td><a class="os-num" href="#/orcamentos/${o.id}">${pad4(o.id)}</a></td><td>${fdate(o.data_emissao)}</td><td>${esc(o.descricao)}</td><td>${badgeOrc(o.status)}</td><td class="num">${brl(DB.totais(o).total)}</td></tr>`)) : vazio('Nenhum orçamento para este veículo.');
  return `<a class="back" href="#/veiculos">Veículos</a>
  <header class="page-head"><div><h1>${esc(v.marca)} ${esc(v.modelo)}</h1><p class="sub">${ordens.length} ordem(ns) de serviço${P.orcamentos ? ` e ${orcs.length} orçamento(s)` : ''} registrada(s).</p></div>
    <div class="head-actions">${P.novaOS && c.ativo ? `<button class="btn primary" data-act="nova-os" data-cliente="${v.cliente_id}" data-veiculo="${v.id}">Abrir OS</button>` : ''}${pode('veiculos') ? `<button class="btn ghost" data-act="editar" data-t="veiculos" data-id="${v.id}">Editar veículo</button>` : ''}</div></header>
  <section class="ticket"><div class="ticket-id" style="border:0;margin:0;padding:0">${plate(v.placa, true)}
    <dl class="facts">
      <div><dt>Proprietário</dt><dd>${esc(c.nome)}${c.ativo ? '' : ' (inativo)'}</dd></div>
      <div><dt>Contato</dt><dd>${esc(c.telefone)}</dd></div>
      <div><dt>Ano e cor</dt><dd>${v.ano || '—'}${v.cor ? ', ' + esc(v.cor) : ''}</dd></div>
      <div><dt>Quilometragem</dt><dd>${Number(v.km).toLocaleString('pt-BR')} km</dd></div>
      <div><dt>Chassi</dt><dd>${esc(v.chassi) || '—'}</dd></div>
    </dl></div></section>
  <h2 class="secao">Ordens de serviço</h2>${tOS}
  ${P.orcamentos ? `<h2 class="secao">Orçamentos</h2>${tOrc}` : ''}`;
}

function tServicos(q) {
  const rows = DB.list('servicos').filter(s => casa(q, s.descricao, s.categoria)).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  if (!rows.length) return vazio(q ? 'Nenhum serviço encontrado para essa busca.' : 'Nenhum serviço no catálogo ainda.');
  return tabela([th('Serviço'), th('Categoria'), th('Valor padrão', 'num'), thAcoes], rows.map(s => `<tr><td><strong>${esc(s.descricao)}</strong></td><td>${esc(s.categoria)}</td><td class="num">${brl(s.valor_padrao)}</td>${acoes('servicos', s.id)}</tr>`));
}

function tPecas(q) {
  const rows = DB.list('pecas').filter(p => casa(q, p.codigo, p.descricao)).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  if (!rows.length) return vazio(q ? 'Nenhuma peça encontrada para essa busca.' : 'Nenhuma peça cadastrada ainda.');
  const V = perm().valores;
  return tabela([th('Código'), th('Peça'), V ? th('Custo', 'num') : '', V ? th('Venda', 'num') : '', th('Situação'), thAcoes], rows.map(p =>
    `<tr><td>${esc(p.codigo)}</td><td><strong>${esc(p.descricao)}</strong></td>${V ? `<td class="num">${brl(p.preco_custo)}</td><td class="num">${brl(p.preco_venda)}</td>` : ''}<td>${p.disponivel ? '<span class="tag ok">Disponível</span>' : '<span class="tag zero">Indisponível</span>'}</td>${acoes('pecas', p.id)}</tr>`));
}

function tUsuarios(q) {
  const rows = DB.list('usuarios').filter(u => casa(q, u.nome, u.login, perfilLabel(u.perfil))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!rows.length) return vazio('Nenhum usuário encontrado para essa busca.');
  return tabela([th('Nome'), th('Usuário'), th('Perfil'), th('Situação'), thAcoes], rows.map(u =>
    `<tr><td><strong>${esc(u.nome)}</strong>${u.id === sessao.id ? ' <span class="muted">(você)</span>' : ''}</td><td>${esc(u.login)}</td><td>${esc(perfilLabel(u.perfil))}</td><td>${u.ativo ? '<span class="tag ok">Ativo</span>' : '<span class="tag zero">Inativo</span>'}</td>
    <td class="end row-actions"><button class="link" data-act="editar" data-t="usuarios" data-id="${u.id}">Editar</button>${u.id === sessao.id ? '' : `<button class="link danger" data-act="excluir" data-t="usuarios" data-id="${u.id}">Excluir</button>`}</td></tr>`));
}

let filtroOS = 'todas';
let periodoMeses = 1;
const PERIODOS = [{ v: 1, l: 'Este mês' }, { v: 3, l: 'Últimos 3 meses' }, { v: 6, l: 'Últimos 6 meses' }, { v: 12, l: 'Últimos 12 meses' }];
function inicioPeriodo(n) {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth() - (n - 1), 1);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-01`;
}
function tOrdens(q) {
  const rows = DB.list('ordens').map(o => ({ o, v: DB.get('veiculos', o.veiculo_id), c: DB.get('clientes', o.cliente_id) }))
    .filter(({ o, v, c }) => (filtroOS === 'todas' || o.status === filtroOS) && casa(q, pad4(o.id), v && v.placa, c && c.nome, o.defeito_relatado, o.mecanico))
    .sort((a, b) => b.o.id - a.o.id);
  if (!rows.length) return vazio(q || filtroOS !== 'todas' ? 'Nenhuma ordem de serviço encontrada com esses filtros.' : 'Nenhuma ordem de serviço ainda. Abra a primeira.');
  const V = perm().valores;
  const pgto = o => (o.status === 'concluida' && V ? (o.pago_em ? ' <span class="tag ok">Paga</span>' : ' <span class="tag low">A receber</span>') : '');
  return tabela([th('OS'), th('Abertura'), th('Veículo'), th('Cliente'), th('Status'), th('Previsão'), V ? th('Total', 'num') : '', thAcoes], rows.map(({ o, v, c }) =>
    `<tr><td><a class="os-num" href="#/os/${o.id}">${pad4(o.id)}</a></td><td>${fdate(o.data_abertura)}<br><span class="muted">${esc(o.hora_abertura || '')}</span></td><td>${plate(v.placa)}<br><span class="muted">${esc(v.marca)} ${esc(v.modelo)}</span></td><td>${esc(c.nome)}</td><td>${badge(o.status)}${pgto(o)}</td><td>${fdate(o.previsao_entrega)}</td>${V ? `<td class="num">${brl(DB.totais(o).total)}</td>` : ''}<td class="end row-actions"><a class="link" href="#/os/${o.id}">Abrir</a></td></tr>`));
}

function viewOrdens() {
  const chips = `<div class="chips" role="group" aria-label="Filtrar por status">${[{ key: 'todas', label: 'Todas' }, ...STATUS].map(s => `<button type="button" class="chip" data-act="filtro" data-s="${s.key}" aria-pressed="${filtroOS === s.key}">${esc(s.label)}</button>`).join('')}</div>`;
  return lista({ pagina: 'os', titulo: 'Ordens de serviço', sub: 'Histórico completo de atendimentos da oficina.', botao: perm().novaOS ? '<button class="btn primary" data-act="nova-os">Abrir ordem de serviço</button>' : '', placeholder: 'Buscar por placa, cliente, número ou problema', fn: tOrdens, extra: chips });
}

function tOrcamentos(q) {
  const rows = DB.list('orcamentos').map(o => ({ o, v: DB.get('veiculos', o.veiculo_id), c: DB.get('clientes', o.cliente_id) }))
    .filter(({ o, v, c }) => casa(q, pad4(o.id), v && v.placa, c && c.nome, o.descricao)).sort((a, b) => b.o.id - a.o.id);
  if (!rows.length) return vazio(q ? 'Nenhum orçamento encontrado para essa busca.' : 'Nenhum orçamento ainda. Crie o primeiro para enviar ao cliente.');
  return tabela([th('Nº'), th('Emissão'), th('Veículo'), th('Cliente'), th('Situação'), th('Total', 'num'), thAcoes], rows.map(({ o, v, c }) =>
    `<tr><td><a class="os-num" href="#/orcamentos/${o.id}">${pad4(o.id)}</a></td><td>${fdate(o.data_emissao)}</td><td>${plate(v.placa)}<br><span class="muted">${esc(v.marca)} ${esc(v.modelo)}</span></td><td>${esc(c.nome)}</td><td>${badgeOrc(o.status)}</td><td class="num">${brl(DB.totais(o).total)}</td><td class="end row-actions"><a class="link" href="#/orcamentos/${o.id}">Abrir</a></td></tr>`));
}

/* Blocos compartilhados pela OS e pelo orçamento */
function situacaoPeca(i) {
  if (!i.encomenda) return '<span class="tag ok">Disponível</span>';
  return i.recebida ? '<span class="tag ok">Recebida</span>' : '<span class="tag low">Aguardando chegada</span>';
}
function situacaoPecaOrc(i) {
  const p = DB.get('pecas', i.peca_id);
  return p && !p.disponivel ? '<span class="tag low">Indisponível: será encomendada</span>' : '<span class="tag ok">Disponível</span>';
}

function blocoItens(o, t, trava) {
  const ehOS = t === 'ordens';
  const V = perm().valores;
  const rm = (kind, id) => (trava ? '' : `<button class="link danger" data-act="rm-item" data-t="${t}" data-id="${o.id}" data-kind="${kind}" data-item="${id}">Remover</button>`);
  const linhasServ = o.itens_servico.length
    ? o.itens_servico.map(i => `<tr><td>${esc(i.descricao)}</td>${V ? `<td class="num">${brl(i.valor)}</td>` : ''}<td class="end no-print">${rm('servico', i.id)}</td></tr>`).join('')
    : `<tr><td colspan="${V ? 3 : 2}" class="muted">Nenhum serviço lançado.</td></tr>`;
  const linhasPeca = o.itens_peca.length
    ? o.itens_peca.map(i => `<tr><td>${esc(i.descricao)}<br><span class="muted">${esc(i.codigo)}</span></td><td class="num">${i.quantidade}</td>${V ? `<td class="num">${brl(i.preco_unit)}</td><td class="num">${brl(i.quantidade * i.preco_unit)}</td>` : ''}<td>${ehOS ? situacaoPeca(i) : situacaoPecaOrc(i)}</td><td class="end no-print">${ehOS && i.encomenda && !i.recebida ? `<button class="link" data-act="receber" data-id="${o.id}" data-item="${i.id}">Marcar como recebida</button>` : ''}${rm('peca', i.id)}</td></tr>`).join('')
    : `<tr><td colspan="${V ? 6 : 4}" class="muted">Nenhuma peça lançada.</td></tr>`;
  const add = (act, label) => (trava ? '' : `<button class="btn ghost small no-print" data-act="${act}" data-t="${t}" data-id="${o.id}">${label}</button>`);
  return `<h3>Serviços</h3>
    <div class="table-wrap"><table class="items"><thead><tr>${th('Descrição')}${V ? th('Valor', 'num') : ''}${th('', 'end no-print')}</tr></thead><tbody>${linhasServ}</tbody></table></div>
    ${add('add-servico', 'Adicionar serviço')}
    <h3>Peças</h3>
    <div class="table-wrap"><table class="items"><thead><tr>${th('Peça')}${th('Qtd.', 'num')}${V ? th('Unitário', 'num') + th('Subtotal', 'num') : ''}${th('Situação')}${th('', 'end no-print')}</tr></thead><tbody>${linhasPeca}</tbody></table></div>
    ${add('add-peca', 'Adicionar peça')}`;
}

function blocoTotais(o, t, descontoLiberado) {
  if (!perm().valores) return '';
  const tt = DB.totais(o);
  return `<div class="totals"><dl>
    <div><dt>Serviços</dt><dd>${brl(tt.servicos)}</dd></div>
    <div><dt>Peças</dt><dd>${brl(tt.pecas)}</dd></div>
    <div><dt><label for="o_desc">Desconto (R$)</label></dt><dd><input id="o_desc" class="money" type="number" min="0" step="0.01" value="${Number(o.desconto)}" data-os-field="desconto" data-t="${t}" data-id="${o.id}"${descontoLiberado ? '' : ' disabled'}></dd></div>
    <div class="grand"><dt>Total</dt><dd>${brl(tt.total)}</dd></div>
  </dl></div>`;
}

function blocoPagamento(o) {
  if (!perm().receber || o.status !== 'concluida') return '';
  return `<div class="pagamento no-print"><h3>Pagamento</h3>${o.pago_em
    ? `<p>Pago em <strong>${fdate(o.pago_em)}</strong> via <strong>${esc(o.forma_pagamento)}</strong>.</p><button class="btn ghost small" data-act="estornar" data-id="${o.id}">Estornar pagamento</button>`
    : `<p class="muted">Atendimento concluído e ainda não pago.</p><button class="btn primary small" data-act="pagar" data-id="${o.id}">Registrar pagamento</button>`}</div>`;
}

function viewOS(id) {
  const o = DB.get('ordens', id);
  if (!o) return `<div class="empty"><p>Ordem de serviço não encontrada.</p><a class="btn ghost" href="#/os">Voltar para a lista</a></div>`;
  const v = DB.get('veiculos', o.veiculo_id), c = DB.get('clientes', o.cliente_id);
  const trava = DB.TRAVADAS.includes(o.status);
  const cancelada = o.status === 'cancelada';
  const passos = STATUS.filter(s => s.key !== 'cancelada');
  const idx = passos.findIndex(s => s.key === o.status);
  const P = perm();
  const garantiaAte = o.data_conclusao && Number(o.garantia_dias) > 0 ? DB.addDays(o.data_conclusao, Number(o.garantia_dias)) : null;
  const aviso = cancelada ? '<p class="lock no-print">Esta OS foi cancelada e está bloqueada. Reabra a OS para editar.</p>'
    : trava ? '<p class="lock no-print">Itens bloqueados porque a OS foi concluída. Volte o status para "Em andamento" se precisar alterá-los.</p>' : '';
  const mecanicos = DB.list('usuarios').filter(u => u.perfil === 'mecanico' && u.ativo).map(u => u.nome);
  if (o.mecanico && !mecanicos.includes(o.mecanico)) mecanicos.push(o.mecanico);
  const sub = `Aberta em ${fdatahora(o.data_abertura, o.hora_abertura)}${o.aberta_por ? ` por ${esc(o.aberta_por)}` : ''}${o.data_conclusao ? `. Concluída em ${fdatahora(o.data_conclusao, o.hora_conclusao)}` : ''}.`;
  const campoOS = (campo, extra = '') => `data-os-field="${campo}" data-t="ordens" data-id="${o.id}"${extra}`;

  return `<a class="back no-print" href="#/os">Ordens de serviço</a>
  <header class="page-head"><div><h1>Ordem de serviço ${pad4(o.id)} ${cancelada ? badge('cancelada') : ''}${o.pago_em ? ' <span class="tag ok">Paga</span>' : ''}</h1><p class="sub">${sub}</p></div>
    <div class="head-actions no-print"><button class="btn ghost" data-act="imprimir" data-titulo="OS-${pad4(o.id)}-${esc(v.placa)}">Imprimir</button>
      ${cancelada && P.status.includes('pendente') ? `<button class="btn ghost" data-act="status" data-id="${o.id}" data-status="pendente">Reabrir OS</button>` : ''}
      ${!cancelada && P.status.includes('cancelada') ? `<button class="btn ghost danger" data-act="status" data-id="${o.id}" data-status="cancelada">Cancelar OS</button>` : ''}
      ${P.excluirOS ? `<button class="btn ghost danger" data-act="os-excluir" data-id="${o.id}">Excluir OS</button>` : ''}</div></header>
  <ol class="stepper no-print" aria-label="Andamento da ordem de serviço">${passos.map((s, i) => `<li><button type="button" class="${i < idx ? 'done' : ''}${i === idx ? ' current' : ''}" data-act="status" data-id="${o.id}" data-status="${s.key}"${i === idx ? ' aria-current="step"' : ''}${P.status.includes(s.key) ? '' : ' disabled title="Seu perfil não pode marcar esta etapa"'}>${esc(s.label)}</button></li>`).join('')}</ol>
  <section class="ticket">
    <p class="print-only letterhead"><strong>OficinaGest</strong> Ordem de serviço ${pad4(o.id)}</p>
    <div class="ticket-id">${P.paginas.includes('veiculos') ? `<a class="plate-link" href="#/veiculos/${v.id}" title="Ver histórico do veículo">${plate(v.placa, true)}</a>` : plate(v.placa, true)}
      <dl class="facts">
        <div><dt>Veículo</dt><dd>${esc(v.marca)} ${esc(v.modelo)}${v.ano ? ', ' + v.ano : ''}${v.cor ? ', ' + esc(v.cor) : ''}</dd></div>
        <div><dt>Quilometragem</dt><dd>${Number(v.km).toLocaleString('pt-BR')} km</dd></div>
        <div><dt>Cliente</dt><dd>${esc(c.nome)}</dd></div>
        <div><dt>Contato</dt><dd>${esc(c.telefone)}</dd></div>
      </dl>
    </div>
    <div class="ticket-fields">
      <div class="field col-2"><label for="o_defeito">Problema relatado</label><textarea id="o_defeito" rows="2" ${campoOS('defeito_relatado')}>${esc(o.defeito_relatado)}</textarea></div>
      <div class="field"><label for="o_mec">Mecânico responsável</label><select id="o_mec" ${campoOS('mecanico', P.atribuir ? '' : ' disabled')}><option value="">Sem responsável</option>${mecanicos.map(m => `<option value="${esc(m)}"${m === o.mecanico ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></div>
      <div class="field"><label for="o_prev">Previsão de entrega</label><input id="o_prev" type="date" value="${esc(o.previsao_entrega)}" ${campoOS('previsao_entrega', P.atribuir && !trava ? '' : ' disabled')}></div>
      <div class="field"><label for="o_gar">Garantia (dias)</label><input id="o_gar" type="number" min="0" value="${Number(o.garantia_dias)}" ${campoOS('garantia_dias')}>${garantiaAte ? `<small>Garantia até ${fdate(garantiaAte)}.</small>` : ''}</div>
      <div class="field"><label for="o_obs">Observações</label><textarea id="o_obs" rows="2" ${campoOS('observacoes')}>${esc(o.observacoes)}</textarea></div>
    </div>
    ${aviso}
    ${blocoItens(o, 'ordens', trava)}
    ${blocoTotais(o, 'ordens', !trava && P.desconto)}
    ${blocoPagamento(o)}
  </section>`;
}

function viewOrcamentos() {
  return lista({ pagina: 'orcamentos', titulo: 'Orçamentos', sub: 'Valores combinados com o cliente antes de abrir a ordem de serviço.', botao: '<button class="btn primary" data-act="novo-orcamento">Novo orçamento</button>', placeholder: 'Buscar por número, placa, cliente ou serviço', fn: tOrcamentos });
}

function resumoOrcamento(o, v, validade) {
  const t = DB.totais(o);
  const linhas = [`Orçamento ${pad4(o.id)} – OficinaGest`, `Veículo: ${v.marca} ${v.modelo} (${placaTxt(v.placa)})`, '', o.descricao, ''];
  o.itens_servico.forEach(i => linhas.push(`• ${i.descricao}: ${brl(i.valor)}`));
  o.itens_peca.forEach(i => linhas.push(`• ${i.quantidade}x ${i.descricao}: ${brl(i.quantidade * i.preco_unit)}`));
  if (t.desconto) linhas.push(`Desconto: ${brl(t.desconto)}`);
  linhas.push('', `Total: ${brl(t.total)}`, `Válido até ${fdate(validade)}. Prazo de execução: ${o.prazo_dias} dia(s).`);
  return linhas.join('\n');
}

function viewOrcamento(id) {
  const o = DB.get('orcamentos', id);
  if (!o) return `<div class="empty"><p>Orçamento não encontrado.</p><a class="btn ghost" href="#/orcamentos">Voltar para a lista</a></div>`;
  const v = DB.get('veiculos', o.veiculo_id), c = DB.get('clientes', o.cliente_id);
  const convertido = o.status === 'convertido';
  const trava = ['aprovado', 'recusado', 'convertido'].includes(o.status);
  const validade = DB.addDays(o.data_emissao, Number(o.validade_dias) || 0);
  const passos = DB.ORC_STATUS.filter(s => s.key !== 'convertido');
  const texto = resumoOrcamento(o, v, validade);
  const fone = onlyDigits(c.telefone);
  const hrefEmail = `mailto:${c.email || ''}?subject=${encodeURIComponent(`Orçamento ${pad4(o.id)} – OficinaGest`)}&body=${encodeURIComponent(texto)}`;
  const hrefZap = `https://wa.me/${fone.length >= 10 && fone.length <= 11 ? '55' + fone : ''}?text=${encodeURIComponent(texto)}`;
  const campo = (nome, extra = '') => `data-os-field="${nome}" data-t="orcamentos" data-id="${o.id}"${convertido || (trava && nome !== 'observacoes') ? ' disabled' : ''}${extra}`;
  return `<a class="back no-print" href="#/orcamentos">Orçamentos</a>
  <header class="page-head"><div><h1>Orçamento ${pad4(o.id)} ${badgeOrc(o.status)}</h1><p class="sub">Emitido em ${fdate(o.data_emissao)}${o.criado_por ? ` por ${esc(o.criado_por)}` : ''}. Válido até ${fdate(validade)}.</p></div>
    <div class="head-actions no-print">
      ${o.status === 'aprovado' ? `<button class="btn primary" data-act="orc-converter" data-id="${o.id}">Converter em OS</button>` : ''}
      ${convertido ? `<a class="btn primary" href="#/os/${o.os_id}">Ver OS ${pad4(o.os_id)}</a>` : ''}
      <button class="btn ghost" data-act="imprimir" data-titulo="Orcamento-${pad4(o.id)}-${esc(v.placa)}">Exportar PDF</button>
      <a class="btn ghost" href="${esc(hrefEmail)}">Enviar por e-mail</a>
      <a class="btn ghost" href="${esc(hrefZap)}" target="_blank" rel="noopener">WhatsApp</a>
      ${convertido ? '' : `<button class="btn ghost danger" data-act="orc-excluir" data-id="${o.id}">Excluir</button>`}</div></header>
  <p class="muted no-print dica">Para enviar o PDF, use "Exportar PDF" e anexe o arquivo à mensagem. Os botões de e-mail e WhatsApp já levam o resumo do orçamento.</p>
  ${convertido ? `<p class="lock no-print">Este orçamento foi convertido na OS ${pad4(o.os_id)}.</p>` : `<ol class="stepper no-print" aria-label="Situação do orçamento">${passos.map(s => `<li><button type="button" class="${s.key === o.status ? 'current' : ''}" data-act="orc-status" data-id="${o.id}" data-status="${s.key}"${s.key === o.status ? ' aria-current="step"' : ''}>${esc(s.label)}</button></li>`).join('')}</ol>`}
  <section class="ticket">
    <p class="print-only letterhead"><strong>OficinaGest</strong> Orçamento ${pad4(o.id)}, válido até ${fdate(validade)}</p>
    <div class="ticket-id">${plate(v.placa, true)}
      <dl class="facts">
        <div><dt>Veículo</dt><dd>${esc(v.marca)} ${esc(v.modelo)}${v.ano ? ', ' + v.ano : ''}${v.cor ? ', ' + esc(v.cor) : ''}</dd></div>
        <div><dt>Quilometragem</dt><dd>${Number(v.km).toLocaleString('pt-BR')} km</dd></div>
        <div><dt>Cliente</dt><dd>${esc(c.nome)}</dd></div>
        <div><dt>Contato</dt><dd>${esc(c.telefone)}</dd></div>
      </dl>
    </div>
    <div class="ticket-fields">
      <div class="field col-2"><label for="q_desc">Serviço solicitado</label><textarea id="q_desc" rows="2" ${campo('descricao')}>${esc(o.descricao)}</textarea></div>
      <div class="field"><label for="q_val">Validade (dias)</label><input id="q_val" type="number" min="1" value="${Number(o.validade_dias)}" ${campo('validade_dias')}></div>
      <div class="field"><label for="q_prazo">Prazo de execução (dias)</label><input id="q_prazo" type="number" min="1" value="${Number(o.prazo_dias)}" ${campo('prazo_dias')}></div>
      <div class="field col-2"><label for="q_obs">Observações</label><textarea id="q_obs" rows="2" ${campo('observacoes')}>${esc(o.observacoes)}</textarea></div>
    </div>
    ${trava && !convertido ? `<p class="lock no-print">${o.status === 'aprovado' ? 'Orçamento aprovado: os itens estão bloqueados.' : 'Orçamento recusado: os itens estão bloqueados.'} Volte para "Aguardando aprovação" para editar.</p>` : ''}
    ${blocoItens(o, 'orcamentos', trava)}
    ${blocoTotais(o, 'orcamentos', !trava)}
  </section>`;
}

const btnNovo = (t, label) => (pode(t) ? `<button class="btn primary" data-act="novo" data-t="${t}">${label}</button>` : '');
const VIEWS = {
  painel: viewPainel,
  os: arg => (arg ? viewOS(Number(arg)) : viewOrdens()),
  orcamentos: arg => (arg ? viewOrcamento(Number(arg)) : viewOrcamentos()),
  clientes: () => lista({ pagina: 'clientes', titulo: 'Clientes', sub: 'Pessoas e empresas atendidas pela oficina.', botao: btnNovo('clientes', 'Novo cliente'), placeholder: 'Buscar por nome, documento, telefone ou e-mail', fn: tClientes }),
  veiculos: arg => (arg ? viewVeiculo(Number(arg)) : lista({ pagina: 'veiculos', titulo: 'Veículos', sub: 'Frota cadastrada, com o proprietário de cada veículo.', botao: btnNovo('veiculos', 'Novo veículo'), placeholder: 'Buscar por placa, modelo, chassi ou proprietário', fn: tVeiculos })),
  servicos: () => lista({ pagina: 'servicos', titulo: 'Serviços', sub: 'Tabela de mão de obra com categoria e valor padrão de cada serviço.', botao: btnNovo('servicos', 'Novo serviço'), placeholder: 'Buscar serviço ou categoria', fn: tServicos }),
  pecas: () => lista({ pagina: 'pecas', titulo: 'Peças', sub: 'Peças disponíveis na oficina. As indisponíveis podem ser encomendadas na ordem de serviço.', botao: btnNovo('pecas', 'Nova peça'), placeholder: 'Buscar por código ou descrição', fn: tPecas }),
  usuarios: () => lista({ pagina: 'usuarios', titulo: 'Usuários', sub: 'Quem pode acessar o sistema e com qual perfil.', botao: btnNovo('usuarios', 'Novo usuário'), placeholder: 'Buscar por nome, usuário ou perfil', fn: tUsuarios })
};

const TITULOS = { painel: 'Painel', os: 'Ordens de serviço', orcamentos: 'Orçamentos', clientes: 'Clientes', veiculos: 'Veículos', servicos: 'Serviços', pecas: 'Peças', usuarios: 'Usuários' };
let ultimaRota = '';

function route() {
  const [p, arg] = (location.hash.replace(/^#\/?/, '') || 'painel').split('/');
  let pagina = VIEWS[p] ? p : 'painel';
  let param = arg;
  if (!perm().paginas.includes(pagina)) {
    toast('Seu perfil não tem acesso a essa tela.', true);
    pagina = 'painel';
    param = undefined;
    history.replaceState(null, '', '#/painel');
  }
  tabelaAtual = null;
  $('#view').innerHTML = VIEWS[pagina](param);
  document.querySelectorAll('.nav a').forEach(a => {
    if (a.dataset.page === pagina) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${TITULOS[pagina]} | OficinaGest`;
  const chave = pagina + '/' + (param || '');
  if (chave !== ultimaRota) { window.scrollTo(0, 0); ultimaRota = chave; }
}

/* ---------- Formulários de OS, orçamento e itens ---------- */
const camposClienteVeiculo = pre => [
  { name: 'cliente_id', label: 'Cliente', type: 'select', required: true, full: true, options: () => clienteOpts(false) },
  { name: 'veiculo_id', label: 'Veículo', type: 'select', required: true, full: true, options: () => veiculosOpts(pre.cliente_id), hint: 'Escolha o cliente para listar os veículos dele.' }
];
const aoMudarCliente = (f, e) => {
  if (e.target.name === 'cliente_id') f.elements.veiculo_id.innerHTML = optsHtml(veiculosOpts(e.target.value), '', 'Selecione o veículo');
};
const veiculoDoCliente = v => { const x = DB.get('veiculos', v.veiculo_id); return x && x.cliente_id === Number(v.cliente_id); };
const mecanicoOpts = () => DB.list('usuarios').filter(u => u.perfil === 'mecanico' && u.ativo).map(u => ({ value: u.nome, label: u.nome }));

function novaOS(pre = {}) {
  if (!perm().novaOS) return toast('Seu perfil não pode abrir ordens de serviço.', true);
  if (!DB.list('veiculos').length) return toast('Cadastre um cliente e um veículo antes de abrir uma OS.', true);
  openForm({
    title: 'Nova ordem de serviço',
    submitLabel: 'Abrir OS',
    values: { previsao_entrega: DB.addDays(DB.today(), 2), ...pre },
    fields: [
      ...camposClienteVeiculo(pre),
      { name: 'defeito_relatado', label: 'Problema relatado pelo cliente', type: 'textarea', required: true, full: true },
      { name: 'mecanico', label: 'Mecânico responsável', type: 'select', placeholder: 'Definir depois', options: mecanicoOpts },
      { name: 'previsao_entrega', label: 'Previsão de entrega', type: 'date', required: true }
    ],
    onChange: aoMudarCliente,
    onSave(v) {
      if (!veiculoDoCliente(v)) return 'O veículo escolhido não pertence a este cliente.';
      if (v.previsao_entrega < DB.today()) return 'A previsão de entrega não pode ser anterior a hoje.';
      const o = DB.novaOS({ cliente_id: Number(v.cliente_id), veiculo_id: Number(v.veiculo_id), defeito_relatado: v.defeito_relatado, mecanico: v.mecanico, previsao_entrega: v.previsao_entrega, aberta_por: sessao.nome });
      location.hash = '#/os/' + o.id;
      toast('Ordem de serviço aberta.');
    }
  });
}

function novoOrcamento() {
  if (!perm().orcamentos) return toast('Seu perfil não pode criar orçamentos.', true);
  openForm({
    title: 'Novo orçamento',
    submitLabel: 'Criar orçamento',
    values: { validade_dias: 15, prazo_dias: 3 },
    fields: [
      ...camposClienteVeiculo({}),
      { name: 'descricao', label: 'Serviço solicitado', type: 'textarea', required: true, full: true },
      { name: 'validade_dias', label: 'Validade (dias)', type: 'number', min: 1, required: true },
      { name: 'prazo_dias', label: 'Prazo de execução (dias)', type: 'number', min: 1, required: true }
    ],
    onChange: aoMudarCliente,
    onSave(v) {
      if (!veiculoDoCliente(v)) return 'O veículo escolhido não pertence a este cliente.';
      if (!inteiro(v.validade_dias) || Number(v.validade_dias) < 1 || !inteiro(v.prazo_dias) || Number(v.prazo_dias) < 1) return 'Validade e prazo devem ser números inteiros a partir de 1.';
      const o = DB.novoOrcamento({ cliente_id: Number(v.cliente_id), veiculo_id: Number(v.veiculo_id), descricao: v.descricao, validade_dias: Number(v.validade_dias), prazo_dias: Number(v.prazo_dias), criado_por: sessao.nome });
      location.hash = '#/orcamentos/' + o.id;
      toast('Orçamento criado.');
    }
  });
}

function addServico(t, id) {
  openForm({
    title: 'Adicionar serviço',
    submitLabel: 'Adicionar',
    fields: [
      { name: 'servico_id', label: 'Serviço da tabela de mão de obra', type: 'select', full: true, required: !perm().valores, placeholder: perm().valores ? 'Serviço avulso (descrever abaixo)' : 'Selecione…', options: () => DB.list('servicos').map(s => ({ value: s.id, label: perm().valores ? `${s.descricao} (${brl(s.valor_padrao)})` : s.descricao })) },
      ...(perm().valores ? [
        { name: 'descricao', label: 'Descrição', required: true, full: true },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0, required: true }] : [])
    ],
    onChange(f, e) {
      if (e.target.name !== 'servico_id' || !f.elements.descricao) return;
      const s = DB.get('servicos', e.target.value);
      if (s) { f.elements.descricao.value = s.descricao; f.elements.valor.value = s.valor_padrao; }
    },
    onSave(v) {
      const cat = DB.get('servicos', v.servico_id);
      const dados = perm().valores ? { descricao: v.descricao, valor: v.valor } : (cat ? { descricao: cat.descricao, valor: cat.valor_padrao } : null);
      if (!dados) return 'Escolha um serviço da tabela de mão de obra.';
      if (isNaN(Number(dados.valor)) || Number(dados.valor) < 0) return 'Informe um valor igual ou maior que zero.';
      const r = DB.addServico(t, id, dados);
      if (!r.ok) return r.erro;
      route();
    }
  });
}

function addPeca(t, id) {
  const ehOS = t === 'ordens';
  const fields = [
    { name: 'peca_id', label: 'Peça', type: 'select', required: true, full: true, options: () => DB.list('pecas').sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')).map(p => ({ value: p.id, label: `${p.descricao} (${p.codigo}) – ${p.disponivel ? 'disponível' : 'indisponível'}` })) },
    { name: 'quantidade', label: 'Quantidade', type: 'number', min: 1, default: 1, required: true }
  ];
  if (ehOS) fields.push({ name: 'encomendar', label: 'Peça indisponível?', type: 'select', placeholder: 'Não se aplica (peça disponível)', options: [{ value: 'sim', label: 'Sim, encomendar esta peça' }], hint: 'A OS passa para "Aguardando peça" até você marcar a chegada.' });
  openForm({
    title: 'Adicionar peça',
    submitLabel: 'Adicionar',
    fields,
    onSave(v) {
      const r = DB.addPeca(t, id, v.peca_id, v.quantidade, v.encomendar === 'sim');
      if (!r.ok) return r.erro;
      route();
    }
  });
}

/* ---------- Eventos ---------- */
let tituloAntes = null;
const actions = {
  fechar: () => closeModal(),
  sair: () => sair(),
  novo: d => abrirEntidade(d.t, null),
  editar: d => abrirEntidade(d.t, Number(d.id)),
  excluir(d) {
    if (!pode(d.t)) return toast('Seu perfil não pode excluir este cadastro.', true);
    if (d.t === 'usuarios' && Number(d.id) === sessao.id) return toast('Você não pode excluir o seu próprio usuário.', true);
    if (!confirm('Excluir este registro? Essa ação não pode ser desfeita.')) return;
    const r = DB.remove(d.t, Number(d.id));
    if (!r.ok) return toast(r.erro, true);
    toast('Registro excluído.');
    route();
  },
  'alternar-cliente'(d) {
    if (!pode('clientes')) return toast('Seu perfil não pode alterar este cadastro.', true);
    const c = DB.get('clientes', d.id);
    DB.update('clientes', c.id, { ativo: !c.ativo });
    toast(c.ativo ? 'Cliente inativado. Ele não aparece mais ao abrir OS e orçamentos.' : 'Cliente reativado.');
    route();
  },
  'nova-os'(d) {
    if (d.cliente) {
      const c = DB.get('clientes', d.cliente);
      if (c && !c.ativo) return toast('Cliente inativo. Reative o cadastro para abrir uma OS.', true);
    }
    novaOS(d.cliente ? { cliente_id: Number(d.cliente), veiculo_id: Number(d.veiculo) } : {});
  },
  'novo-orcamento': () => novoOrcamento(),
  filtro(d) { filtroOS = d.s; route(); },
  status(d) {
    if (!perm().status.includes(d.status)) return toast('Seu perfil não pode marcar esta etapa.', true);
    if (d.status === 'cancelada' && !confirm('Cancelar esta ordem de serviço?')) return;
    const r = DB.mudarStatus(Number(d.id), d.status);
    if (!r.ok) toast(r.erro, true); else toast('Status atualizado.');
    route();
  },
  'orc-status'(d) {
    if (!perm().orcamentos) return toast('Seu perfil não pode alterar orçamentos.', true);
    const r = DB.mudarStatusOrc(Number(d.id), d.status);
    if (!r.ok) toast(r.erro, true); else toast('Situação do orçamento atualizada.');
    route();
  },
  'orc-converter'(d) {
    if (!perm().orcamentos || !perm().novaOS) return toast('Seu perfil não pode converter orçamentos.', true);
    const r = DB.converterOrcamento(Number(d.id), sessao.nome);
    if (!r.ok) return toast(r.erro, true);
    location.hash = '#/os/' + r.os.id;
    toast(r.os.status === 'aguardando_peca' ? 'Orçamento convertido. Há peça indisponível: ela foi lançada como encomenda.' : 'Orçamento convertido em ordem de serviço.');
  },
  'orc-excluir'(d) {
    if (!perm().orcamentos) return toast('Seu perfil não pode excluir orçamentos.', true);
    if (!confirm('Excluir este orçamento? Essa ação não pode ser desfeita.')) return;
    const r = DB.remove('orcamentos', Number(d.id));
    if (!r.ok) return toast(r.erro, true);
    toast('Orçamento excluído.');
    location.hash = '#/orcamentos';
  },
  /* No diálogo de impressão do navegador, escolha "Salvar como PDF". O título vira o nome do arquivo. */
  imprimir(d) {
    tituloAntes = document.title;
    if (d.titulo) document.title = d.titulo;
    window.print();
  },
  pagar(d) {
    if (!perm().receber) return toast('Seu perfil não pode registrar pagamentos.', true);
    openForm({
      title: 'Registrar pagamento',
      submitLabel: 'Registrar',
      values: { pago_em: DB.today() },
      fields: [
        { name: 'forma', label: 'Forma de pagamento', type: 'select', required: true, options: DB.FORMAS_PAGAMENTO.map(f => ({ value: f, label: f })) },
        { name: 'pago_em', label: 'Data do pagamento', type: 'date', required: true }
      ],
      onSave(v) {
        const r = DB.registrarPagamento(Number(d.id), v.forma, v.pago_em);
        if (!r.ok) return r.erro;
        toast('Pagamento registrado.');
        route();
      }
    });
  },
  estornar(d) {
    if (!perm().receber) return toast('Seu perfil não pode estornar pagamentos.', true);
    if (!confirm('Estornar o pagamento desta OS?')) return;
    DB.estornarPagamento(Number(d.id));
    toast('Pagamento estornado.');
    route();
  },
  receber(d) {
    const r = DB.receberPeca(Number(d.id), d.item);
    if (!r.ok) toast(r.erro, true); else toast('Chegada da peça registrada.');
    route();
  },
  'os-excluir'(d) {
    if (!perm().excluirOS) return toast('Seu perfil não pode excluir ordens de serviço.', true);
    if (!confirm('Excluir esta ordem de serviço? Essa ação não pode ser desfeita.')) return;
    const r = DB.remove('ordens', Number(d.id));
    if (!r.ok) return toast(r.erro, true);
    toast('Ordem de serviço excluída.');
    location.hash = '#/os';
  },
  'add-servico': d => addServico(d.t || 'ordens', Number(d.id)),
  'add-peca': d => addPeca(d.t || 'ordens', Number(d.id)),
  'rm-item'(d) {
    const r = DB.removeItem(d.t || 'ordens', Number(d.id), d.kind, d.item);
    if (!r.ok) toast(r.erro, true);
    route();
  },
  restaurar() {
    if (!perm().restaurar) return toast('Apenas o administrador pode restaurar os dados.', true);
    if (!confirm('Apagar todos os dados (inclusive usuários) e restaurar os dados de exemplo? Você precisará entrar de novo.')) return;
    DB.reset();
    sair();
  }
};

document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('overlay')) return closeModal();
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el.dataset, el, e);
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.statusSelect) {
    if (!perm().status.includes(el.value)) { toast('Seu perfil não pode marcar esta etapa.', true); route(); return; }
    const r = DB.mudarStatus(Number(el.dataset.statusSelect), el.value);
    if (!r.ok) toast(r.erro, true); else toast('Status atualizado.');
    route();
  } else if (el.dataset.periodo !== undefined) {
    periodoMeses = Number(el.value) || 1;
    route();
  } else if (el.dataset.osField) {
    const campo = el.dataset.osField, t = el.dataset.t || 'ordens';
    if (t === 'ordens' && ((campo === 'desconto' && !perm().desconto) || ((campo === 'mecanico' || campo === 'previsao_entrega') && !perm().atribuir))) { toast('Seu perfil não pode alterar este campo.', true); route(); return; }
    if (t === 'orcamentos' && !perm().orcamentos) { toast('Seu perfil não pode alterar orçamentos.', true); route(); return; }
    let valor = el.value;
    if (['garantia_dias', 'desconto'].includes(campo)) valor = Math.max(0, Number(valor) || 0);
    if (['validade_dias', 'prazo_dias'].includes(campo)) valor = Math.max(1, Math.floor(Number(valor)) || 1);
    DB.update(t, Number(el.dataset.id), { [campo]: valor });
    route();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'busca' && tabelaAtual) {
    busca[tabelaAtual.pagina] = e.target.value;
    $('#tabela').innerHTML = tabelaAtual.fn(e.target.value);
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root .overlay')) closeModal(); });
window.addEventListener('afterprint', () => { if (tituloAntes) { document.title = tituloAntes; tituloAntes = null; } });
window.addEventListener('hashchange', () => { if (sessao) route(); });

/* Mantém várias abas do mesmo navegador em sincronia (demonstra a atualização do painel entre terminais). */
window.addEventListener('storage', e => {
  if (e.key !== DB.KEY || !sessao) return;
  DB.reload();
  const atual = lerSessao();
  if (!atual) return sair('Seu acesso foi alterado por um administrador. Entre novamente.');
  sessao = atual;
  atualizarMenu();
  if (!$('#modal-root .overlay')) route();
});

function iniciar() {
  sessao = lerSessao();
  if (!sessao) return telaLogin();
  $('#login-root').innerHTML = '';
  document.querySelector('.shell').hidden = false;
  atualizarMenu();
  reiniciarInatividade();
  route();
}
iniciar();
