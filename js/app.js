'use strict';

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fdate = iso => (iso ? iso.split('-').reverse().join('/') : '—');
const pad4 = n => String(n).padStart(4, '0');
const onlyDigits = s => String(s ?? '').replace(/\D/g, '');
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const casa = (q, ...campos) => !q || campos.some(c => norm(c).includes(norm(q)));
const STATUS = DB.STATUS;
const statusLabel = k => (STATUS.find(s => s.key === k) || {}).label || k;
const badge = k => `<span class="badge" data-s="${esc(k)}">${esc(statusLabel(k))}</span>`;
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
const docValido = v => { const d = onlyDigits(v); return d.length === 14 || cpfValido(d); };
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
  toastTimer = setTimeout(() => { t.className = ''; }, 3600);
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
const clienteOpts = () => DB.list('clientes').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(c => ({ value: c.id, label: c.nome }));
const veiculosOpts = cid => (cid ? DB.list('veiculos').filter(v => v.cliente_id === Number(cid)).map(v => ({ value: v.id, label: `${placaTxt(v.placa)} – ${v.marca} ${v.modelo}` })) : []);
const inteiro = v => /^\d+$/.test(String(v));

const ENT = {
  clientes: {
    titulos: { novo: 'Novo cliente', editar: 'Editar cliente', ok: 'Cliente salvo.' },
    fields: [
      { name: 'nome', label: 'Nome ou razão social', required: true, full: true },
      { name: 'cpf_cnpj', label: 'CPF ou CNPJ', required: true },
      { name: 'telefone', label: 'Telefone com DDD', required: true },
      { name: 'email', label: 'E-mail', type: 'email', full: true },
      { name: 'endereco', label: 'Endereço', full: true }
    ],
    validate(v, id) {
      if (!docValido(v.cpf_cnpj)) return 'CPF ou CNPJ inválido.';
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
      { name: 'cliente_id', label: 'Proprietário', type: 'select', required: true, full: true, options: clienteOpts },
      { name: 'placa', label: 'Placa', required: true, maxlength: 8, hint: 'Padrão antigo (ABC-1234) ou Mercosul (ABC1D23).' },
      { name: 'ano', label: 'Ano', type: 'number', min: 1950 },
      { name: 'marca', label: 'Marca', required: true },
      { name: 'modelo', label: 'Modelo', required: true },
      { name: 'cor', label: 'Cor' },
      { name: 'km', label: 'Quilometragem', type: 'number', min: 0 }
    ],
    validate(v, id) {
      const placa = v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return 'Placa inválida. Use o formato ABC-1234 ou ABC1D23.';
      if (DB.list('veiculos').some(x => x.id !== id && x.placa === placa)) return 'Já existe um veículo com esta placa.';
      const max = new Date().getFullYear() + 1;
      if (v.ano && (!inteiro(v.ano) || Number(v.ano) < 1950 || Number(v.ano) > max)) return `Ano deve estar entre 1950 e ${max}.`;
      if (v.km && !inteiro(v.km)) return 'A quilometragem deve ser um número inteiro, sem negativos.';
    },
    normalize: v => ({ ...v, cliente_id: Number(v.cliente_id), placa: v.placa.toUpperCase().replace(/[^A-Z0-9]/g, ''), ano: v.ano ? Number(v.ano) : null, km: v.km ? Number(v.km) : 0 })
  },
  servicos: {
    titulos: { novo: 'Novo serviço', editar: 'Editar serviço', ok: 'Serviço salvo.' },
    fields: [
      { name: 'descricao', label: 'Descrição', required: true, full: true },
      { name: 'valor_padrao', label: 'Valor padrão (R$)', type: 'number', step: '0.01', min: 0, required: true }
    ],
    validate: v => (Number(v.valor_padrao) < 0 || isNaN(Number(v.valor_padrao)) ? 'Informe um valor igual ou maior que zero.' : undefined),
    normalize: v => ({ ...v, valor_padrao: Number(v.valor_padrao) })
  },
  pecas: {
    titulos: { novo: 'Nova peça', editar: 'Editar peça', ok: 'Peça salva.' },
    fields: [
      { name: 'codigo', label: 'Código', required: true },
      { name: 'descricao', label: 'Descrição', required: true, full: true },
      { name: 'preco_custo', label: 'Preço de custo (R$)', type: 'number', step: '0.01', min: 0 },
      { name: 'preco_venda', label: 'Preço de venda (R$)', type: 'number', step: '0.01', min: 0, required: true },
      { name: 'qtd_estoque', label: 'Quantidade em estoque', type: 'number', min: 0, required: true },
      { name: 'estoque_minimo', label: 'Estoque mínimo', type: 'number', min: 0, hint: 'Abaixo disso a peça aparece como estoque baixo.' }
    ],
    validate(v, id) {
      if (DB.list('pecas').some(p => p.id !== id && norm(p.codigo) === norm(v.codigo))) return 'Já existe uma peça com este código.';
      if (isNaN(Number(v.preco_venda)) || Number(v.preco_venda) < 0) return 'Preço de venda inválido.';
      if (v.preco_custo && (isNaN(Number(v.preco_custo)) || Number(v.preco_custo) < 0)) return 'Preço de custo inválido.';
      if (!inteiro(v.qtd_estoque)) return 'A quantidade em estoque deve ser um número inteiro, sem negativos.';
      if (v.estoque_minimo && !inteiro(v.estoque_minimo)) return 'O estoque mínimo deve ser um número inteiro.';
    },
    normalize: v => ({ ...v, preco_custo: Number(v.preco_custo) || 0, preco_venda: Number(v.preco_venda), qtd_estoque: Number(v.qtd_estoque), estoque_minimo: Number(v.estoque_minimo) || 0 })
  }
};

function abrirEntidade(t, id) {
  const cfg = ENT[t];
  const reg = id ? DB.get(t, id) : null;
  openForm({
    title: reg ? cfg.titulos.editar : cfg.titulos.novo,
    fields: cfg.fields,
    values: reg || {},
    onSave(v) {
      const err = cfg.validate(v, id);
      if (err) return err;
      const dados = cfg.normalize(v);
      if (id) DB.update(t, id, dados); else DB.insert(t, dados);
      toast(cfg.titulos.ok);
      route();
    }
  });
}

/* ---------- Componentes de tela ---------- */
const acoes = (t, id) => `<td class="end row-actions"><button class="link" data-act="editar" data-t="${t}" data-id="${id}">Editar</button><button class="link danger" data-act="excluir" data-t="${t}" data-id="${id}">Excluir</button></td>`;
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

/* ---------- Telas ---------- */
function viewPainel() {
  const ordens = DB.list('ordens');
  const abertas = ordens.filter(o => !DB.FECHADAS.includes(o.status));
  const mes = DB.today().slice(0, 7);
  const faturado = ordens.filter(o => DB.FECHADAS.includes(o.status) && (o.data_conclusao || '').startsWith(mes)).reduce((a, o) => a + DB.totais(o).total, 0);
  const baixo = DB.list('pecas').filter(p => p.qtd_estoque <= p.estoque_minimo).sort((a, b) => a.qtd_estoque - b.qtd_estoque);
  const aguardando = ordens.filter(o => o.status === 'aguardando_peca').length;
  const colunas = ['aberta', 'em_andamento', 'aguardando_peca', 'concluida'];

  const card = o => {
    const v = DB.get('veiculos', o.veiculo_id), c = DB.get('clientes', o.cliente_id);
    return `<article class="os-card">
      <div class="os-card-top">${plate(v.placa)}<a class="os-num" href="#/os/${o.id}">OS ${pad4(o.id)}</a></div>
      <p class="os-car">${esc(v.marca)} ${esc(v.modelo)}</p>
      <p class="muted">${esc(c.nome)}</p>
      <p class="os-defect">${esc(o.defeito_relatado)}</p>
      <div class="os-card-foot"><span class="muted">${fdate(o.data_abertura)}</span><strong>${brl(DB.totais(o).total)}</strong></div>
      <label class="sr" for="st${o.id}">Status da OS ${pad4(o.id)}</label>
      <select id="st${o.id}" class="status-select" data-status-select="${o.id}">${STATUS.map(s => `<option value="${s.key}"${s.key === o.status ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
    </article>`;
  };

  return `<header class="page-head"><div><h1>Painel da oficina</h1><p class="sub">Acompanhe os carros que estão no pátio hoje.</p></div>
    <button class="btn primary" data-act="nova-os">Abrir ordem de serviço</button></header>
  <dl class="strip">
    <div><dt>Ordens em aberto</dt><dd>${abertas.length}</dd></div>
    <div><dt>Aguardando peça</dt><dd>${aguardando}</dd></div>
    <div><dt>Faturado no mês</dt><dd>${brl(faturado)}</dd></div>
    <div><dt>Peças com estoque baixo</dt><dd>${baixo.length}</dd></div>
  </dl>
  <section aria-label="Quadro de ordens de serviço" class="board">
    ${colunas.map(k => { const os = ordens.filter(o => o.status === k).sort((a, b) => a.data_abertura.localeCompare(b.data_abertura)); return `<div class="col" data-s="${k}"><h2>${esc(statusLabel(k))} <span class="count">${os.length}</span></h2>${os.length ? os.map(card).join('') : '<p class="muted col-empty">Nenhuma OS nesta etapa.</p>'}</div>`; }).join('')}
  </section>
  <section class="estoque-baixo">
    <h2>Estoque baixo</h2>
    ${baixo.length ? `<ul>${baixo.map(p => `<li><span><strong>${esc(p.descricao)}</strong> <span class="muted">${esc(p.codigo)}</span></span><span>${p.qtd_estoque === 0 ? '<span class="tag zero">Sem estoque</span>' : `<span class="tag low">${p.qtd_estoque} un. (mínimo ${p.estoque_minimo})</span>`}</span></li>`).join('')}</ul>` : '<p class="muted">Todas as peças estão acima do estoque mínimo.</p>'}
  </section>`;
}

function tClientes(q) {
  const rows = DB.list('clientes').filter(c => casa(q, c.nome, c.cpf_cnpj, c.telefone, c.email)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!rows.length) return vazio(q ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado ainda. Cadastre o primeiro para começar.');
  return tabela([th('Cliente'), th('CPF/CNPJ'), th('Contato'), th('Veículos'), thAcoes], rows.map(c => {
    const vs = DB.list('veiculos').filter(v => v.cliente_id === c.id);
    return `<tr><td><strong>${esc(c.nome)}</strong></td><td>${esc(c.cpf_cnpj)}</td><td>${esc(c.telefone)}<br><span class="muted">${esc(c.email)}</span></td><td class="plates">${vs.length ? vs.map(v => plate(v.placa)).join('') : '<span class="muted">Nenhum</span>'}</td>${acoes('clientes', c.id)}</tr>`;
  }));
}

function tVeiculos(q) {
  const rows = DB.list('veiculos').map(v => ({ v, c: DB.get('clientes', v.cliente_id) }))
    .filter(({ v, c }) => casa(q, v.placa, v.marca, v.modelo, c && c.nome)).sort((a, b) => a.v.placa.localeCompare(b.v.placa));
  if (!rows.length) return vazio(q ? 'Nenhum veículo encontrado para essa busca.' : 'Nenhum veículo cadastrado ainda. Cadastre um cliente e depois o veículo dele.');
  return tabela([th('Placa'), th('Veículo'), th('Proprietário'), th('Ano'), th('Km', 'num'), thAcoes], rows.map(({ v, c }) =>
    `<tr><td>${plate(v.placa)}</td><td><strong>${esc(v.marca)} ${esc(v.modelo)}</strong><br><span class="muted">${esc(v.cor)}</span></td><td>${esc(c ? c.nome : '—')}</td><td>${v.ano || '—'}</td><td class="num">${Number(v.km).toLocaleString('pt-BR')}</td>
    <td class="end row-actions"><button class="link" data-act="nova-os" data-cliente="${v.cliente_id}" data-veiculo="${v.id}">Abrir OS</button><button class="link" data-act="editar" data-t="veiculos" data-id="${v.id}">Editar</button><button class="link danger" data-act="excluir" data-t="veiculos" data-id="${v.id}">Excluir</button></td></tr>`));
}

function tServicos(q) {
  const rows = DB.list('servicos').filter(s => casa(q, s.descricao)).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  if (!rows.length) return vazio(q ? 'Nenhum serviço encontrado para essa busca.' : 'Nenhum serviço no catálogo ainda.');
  return tabela([th('Serviço'), th('Valor padrão', 'num'), thAcoes], rows.map(s => `<tr><td><strong>${esc(s.descricao)}</strong></td><td class="num">${brl(s.valor_padrao)}</td>${acoes('servicos', s.id)}</tr>`));
}

function tPecas(q) {
  const rows = DB.list('pecas').filter(p => casa(q, p.codigo, p.descricao)).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  if (!rows.length) return vazio(q ? 'Nenhuma peça encontrada para essa busca.' : 'Nenhuma peça cadastrada ainda.');
  return tabela([th('Código'), th('Peça'), th('Custo', 'num'), th('Venda', 'num'), th('Estoque', 'num'), thAcoes], rows.map(p => {
    const tag = p.qtd_estoque === 0 ? '<span class="tag zero">Sem estoque</span> ' : p.qtd_estoque <= p.estoque_minimo ? '<span class="tag low">Baixo</span> ' : '';
    return `<tr><td>${esc(p.codigo)}</td><td><strong>${esc(p.descricao)}</strong></td><td class="num">${brl(p.preco_custo)}</td><td class="num">${brl(p.preco_venda)}</td><td class="num">${tag}${p.qtd_estoque}</td>${acoes('pecas', p.id)}</tr>`;
  }));
}

let filtroOS = 'todas';
function tOrdens(q) {
  const rows = DB.list('ordens').map(o => ({ o, v: DB.get('veiculos', o.veiculo_id), c: DB.get('clientes', o.cliente_id) }))
    .filter(({ o, v, c }) => (filtroOS === 'todas' || o.status === filtroOS) && casa(q, pad4(o.id), v && v.placa, c && c.nome, o.defeito_relatado, o.mecanico))
    .sort((a, b) => b.o.id - a.o.id);
  if (!rows.length) return vazio(q || filtroOS !== 'todas' ? 'Nenhuma ordem de serviço encontrada com esses filtros.' : 'Nenhuma ordem de serviço ainda. Abra a primeira.');
  return tabela([th('OS'), th('Abertura'), th('Veículo'), th('Cliente'), th('Status'), th('Total', 'num'), thAcoes], rows.map(({ o, v, c }) =>
    `<tr><td><a class="os-num" href="#/os/${o.id}">${pad4(o.id)}</a></td><td>${fdate(o.data_abertura)}</td><td>${plate(v.placa)}<br><span class="muted">${esc(v.marca)} ${esc(v.modelo)}</span></td><td>${esc(c.nome)}</td><td>${badge(o.status)}</td><td class="num">${brl(DB.totais(o).total)}</td><td class="end row-actions"><a class="link" href="#/os/${o.id}">Abrir</a></td></tr>`));
}

function viewOrdens() {
  const chips = `<div class="chips" role="group" aria-label="Filtrar por status">${[{ key: 'todas', label: 'Todas' }, ...STATUS].map(s => `<button type="button" class="chip" data-act="filtro" data-s="${s.key}" aria-pressed="${filtroOS === s.key}">${esc(s.label)}</button>`).join('')}</div>`;
  return lista({ pagina: 'os', titulo: 'Ordens de serviço', sub: 'Histórico completo de atendimentos da oficina.', botao: '<button class="btn primary" data-act="nova-os">Abrir ordem de serviço</button>', placeholder: 'Buscar por placa, cliente, número ou problema', fn: tOrdens, extra: chips });
}

function viewOS(id) {
  const o = DB.get('ordens', id);
  if (!o) return `<div class="empty"><p>Ordem de serviço não encontrada.</p><a class="btn ghost" href="#/os">Voltar para a lista</a></div>`;
  const v = DB.get('veiculos', o.veiculo_id), c = DB.get('clientes', o.cliente_id), t = DB.totais(o);
  const trava = DB.FECHADAS.includes(o.status);
  const idx = STATUS.findIndex(s => s.key === o.status);
  const garantiaAte = o.data_conclusao && Number(o.garantia_dias) > 0 ? DB.addDays(o.data_conclusao, Number(o.garantia_dias)) : null;
  const aviso = trava ? '<p class="lock no-print">Itens bloqueados porque a OS foi concluída. Volte o status para "Em andamento" se precisar alterá-los.</p>' : '';

  const linhasServ = o.itens_servico.length
    ? o.itens_servico.map(i => `<tr><td>${esc(i.descricao)}</td><td class="num">${brl(i.valor)}</td><td class="end no-print">${trava ? '' : `<button class="link danger" data-act="rm-item" data-id="${o.id}" data-kind="servico" data-item="${i.id}">Remover</button>`}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">Nenhum serviço lançado.</td></tr>';
  const linhasPeca = o.itens_peca.length
    ? o.itens_peca.map(i => `<tr><td>${esc(i.descricao)}<br><span class="muted">${esc(i.codigo)}</span></td><td class="num">${i.quantidade}</td><td class="num">${brl(i.preco_unit)}</td><td class="num">${brl(i.quantidade * i.preco_unit)}</td><td class="end no-print">${trava ? '' : `<button class="link danger" data-act="rm-item" data-id="${o.id}" data-kind="peca" data-item="${i.id}">Remover</button>`}</td></tr>`).join('')
    : '<tr><td colspan="5" class="muted">Nenhuma peça lançada.</td></tr>';

  return `<a class="back no-print" href="#/os">Ordens de serviço</a>
  <header class="page-head"><div><h1>Ordem de serviço ${pad4(o.id)}</h1><p class="sub">Aberta em ${fdate(o.data_abertura)}${o.data_conclusao ? `, concluída em ${fdate(o.data_conclusao)}` : ''}.</p></div>
    <div class="head-actions no-print"><button class="btn ghost" data-act="imprimir">Imprimir</button><button class="btn ghost danger" data-act="os-excluir" data-id="${o.id}">Excluir OS</button></div></header>
  <ol class="stepper no-print" aria-label="Andamento da ordem de serviço">${STATUS.map((s, i) => `<li><button type="button" class="${i < idx ? 'done' : ''}${i === idx ? ' current' : ''}" data-act="status" data-id="${o.id}" data-status="${s.key}"${i === idx ? ' aria-current="step"' : ''}>${esc(s.label)}</button></li>`).join('')}</ol>
  <section class="ticket">
    <div class="ticket-id">${plate(v.placa, true)}
      <dl class="facts">
        <div><dt>Veículo</dt><dd>${esc(v.marca)} ${esc(v.modelo)}${v.ano ? ', ' + v.ano : ''}${v.cor ? ', ' + esc(v.cor) : ''}</dd></div>
        <div><dt>Quilometragem</dt><dd>${Number(v.km).toLocaleString('pt-BR')} km</dd></div>
        <div><dt>Cliente</dt><dd>${esc(c.nome)}</dd></div>
        <div><dt>Contato</dt><dd>${esc(c.telefone)}</dd></div>
      </dl>
    </div>
    <div class="ticket-fields">
      <div class="field col-2"><label for="o_defeito">Problema relatado</label><textarea id="o_defeito" rows="2" data-os-field="defeito_relatado" data-id="${o.id}">${esc(o.defeito_relatado)}</textarea></div>
      <div class="field"><label for="o_mec">Mecânico responsável</label><input id="o_mec" value="${esc(o.mecanico)}" data-os-field="mecanico" data-id="${o.id}"></div>
      <div class="field"><label for="o_gar">Garantia (dias)</label><input id="o_gar" type="number" min="0" value="${Number(o.garantia_dias)}" data-os-field="garantia_dias" data-id="${o.id}">${garantiaAte ? `<small>Garantia até ${fdate(garantiaAte)}.</small>` : ''}</div>
      <div class="field col-2"><label for="o_obs">Observações</label><textarea id="o_obs" rows="2" data-os-field="observacoes" data-id="${o.id}">${esc(o.observacoes)}</textarea></div>
    </div>
    ${aviso}
    <h3>Serviços</h3>
    <div class="table-wrap"><table class="items"><thead><tr>${th('Descrição')}${th('Valor', 'num')}${th('', 'end no-print')}</tr></thead><tbody>${linhasServ}</tbody></table></div>
    ${trava ? '' : `<button class="btn ghost small no-print" data-act="add-servico" data-id="${o.id}">Adicionar serviço</button>`}
    <h3>Peças</h3>
    <div class="table-wrap"><table class="items"><thead><tr>${th('Peça')}${th('Qtd.', 'num')}${th('Unitário', 'num')}${th('Subtotal', 'num')}${th('', 'end no-print')}</tr></thead><tbody>${linhasPeca}</tbody></table></div>
    ${trava ? '' : `<button class="btn ghost small no-print" data-act="add-peca" data-id="${o.id}">Adicionar peça</button>`}
    <div class="totals">
      <dl>
        <div><dt>Serviços</dt><dd>${brl(t.servicos)}</dd></div>
        <div><dt>Peças</dt><dd>${brl(t.pecas)}</dd></div>
        <div><dt><label for="o_desc">Desconto (R$)</label></dt><dd><input id="o_desc" class="money" type="number" min="0" step="0.01" value="${Number(o.desconto)}" data-os-field="desconto" data-id="${o.id}"${trava ? ' disabled' : ''}></dd></div>
        <div class="grand"><dt>Total</dt><dd>${brl(t.total)}</dd></div>
      </dl>
    </div>
  </section>`;
}

const VIEWS = {
  painel: viewPainel,
  os: arg => (arg ? viewOS(Number(arg)) : viewOrdens()),
  clientes: () => lista({ pagina: 'clientes', titulo: 'Clientes', sub: 'Pessoas e empresas atendidas pela oficina.', botao: '<button class="btn primary" data-act="novo" data-t="clientes">Novo cliente</button>', placeholder: 'Buscar por nome, documento, telefone ou e-mail', fn: tClientes }),
  veiculos: () => lista({ pagina: 'veiculos', titulo: 'Veículos', sub: 'Frota cadastrada, com o proprietário de cada veículo.', botao: '<button class="btn primary" data-act="novo" data-t="veiculos">Novo veículo</button>', placeholder: 'Buscar por placa, modelo ou proprietário', fn: tVeiculos }),
  servicos: () => lista({ pagina: 'servicos', titulo: 'Serviços', sub: 'Catálogo de mão de obra com o valor padrão de cada serviço.', botao: '<button class="btn primary" data-act="novo" data-t="servicos">Novo serviço</button>', placeholder: 'Buscar serviço', fn: tServicos }),
  pecas: () => lista({ pagina: 'pecas', titulo: 'Peças e estoque', sub: 'O estoque é baixado quando a OS é concluída.', botao: '<button class="btn primary" data-act="novo" data-t="pecas">Nova peça</button>', placeholder: 'Buscar por código ou descrição', fn: tPecas })
};

const TITULOS = { painel: 'Painel', os: 'Ordens de serviço', clientes: 'Clientes', veiculos: 'Veículos', servicos: 'Serviços', pecas: 'Peças e estoque' };
let ultimaRota = '';

function route() {
  const [p, arg] = (location.hash.replace(/^#\/?/, '') || 'painel').split('/');
  const pagina = VIEWS[p] ? p : 'painel';
  tabelaAtual = null;
  $('#view').innerHTML = VIEWS[pagina](arg);
  document.querySelectorAll('.nav a').forEach(a => {
    if (a.dataset.page === pagina) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${TITULOS[pagina]} | OficinaGest`;
  const chave = pagina + '/' + (arg || '');
  if (chave !== ultimaRota) { window.scrollTo(0, 0); ultimaRota = chave; }
}

/* ---------- Ordem de serviço: formulários ---------- */
function novaOS(pre = {}) {
  if (!DB.list('veiculos').length) return toast('Cadastre um cliente e um veículo antes de abrir uma OS.', true);
  openForm({
    title: 'Nova ordem de serviço',
    submitLabel: 'Abrir OS',
    values: pre,
    fields: [
      { name: 'cliente_id', label: 'Cliente', type: 'select', required: true, full: true, options: clienteOpts },
      { name: 'veiculo_id', label: 'Veículo', type: 'select', required: true, full: true, options: () => veiculosOpts(pre.cliente_id), hint: 'Escolha o cliente para listar os veículos dele.' },
      { name: 'defeito_relatado', label: 'Problema relatado pelo cliente', type: 'textarea', required: true, full: true },
      { name: 'mecanico', label: 'Mecânico responsável', full: true }
    ],
    onChange(f, e) {
      if (e.target.name === 'cliente_id') f.elements.veiculo_id.innerHTML = optsHtml(veiculosOpts(e.target.value), '', 'Selecione o veículo');
    },
    onSave(v) {
      const veiculo = DB.get('veiculos', v.veiculo_id);
      if (!veiculo || veiculo.cliente_id !== Number(v.cliente_id)) return 'O veículo escolhido não pertence a este cliente.';
      const o = DB.novaOS({ cliente_id: Number(v.cliente_id), veiculo_id: Number(v.veiculo_id), defeito_relatado: v.defeito_relatado, mecanico: v.mecanico });
      location.hash = '#/os/' + o.id;
      toast('Ordem de serviço aberta.');
    }
  });
}

function addServico(osId) {
  openForm({
    title: 'Adicionar serviço',
    submitLabel: 'Adicionar',
    fields: [
      { name: 'servico_id', label: 'Serviço do catálogo', type: 'select', full: true, placeholder: 'Serviço avulso (descrever abaixo)', options: () => DB.list('servicos').map(s => ({ value: s.id, label: `${s.descricao} (${brl(s.valor_padrao)})` })) },
      { name: 'descricao', label: 'Descrição', required: true, full: true },
      { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0, required: true }
    ],
    onChange(f, e) {
      if (e.target.name !== 'servico_id') return;
      const s = DB.get('servicos', e.target.value);
      if (s) { f.elements.descricao.value = s.descricao; f.elements.valor.value = s.valor_padrao; }
    },
    onSave(v) {
      if (isNaN(Number(v.valor)) || Number(v.valor) < 0) return 'Informe um valor igual ou maior que zero.';
      const r = DB.addServico(osId, { descricao: v.descricao, valor: v.valor });
      if (!r.ok) return r.erro;
      route();
    }
  });
}

function addPeca(osId) {
  openForm({
    title: 'Adicionar peça',
    submitLabel: 'Adicionar',
    fields: [
      { name: 'peca_id', label: 'Peça', type: 'select', required: true, full: true, options: () => DB.list('pecas').map(p => ({ value: p.id, label: `${p.descricao} (${p.codigo}), estoque: ${p.qtd_estoque}` })) },
      { name: 'quantidade', label: 'Quantidade', type: 'number', min: 1, default: 1, required: true }
    ],
    onSave(v) {
      const r = DB.addPeca(osId, v.peca_id, v.quantidade);
      if (!r.ok) return r.erro;
      route();
    }
  });
}

/* ---------- Eventos ---------- */
const actions = {
  fechar: () => closeModal(),
  novo: d => abrirEntidade(d.t, null),
  editar: d => abrirEntidade(d.t, Number(d.id)),
  excluir(d) {
    if (!confirm('Excluir este registro? Essa ação não pode ser desfeita.')) return;
    const r = DB.remove(d.t, Number(d.id));
    if (!r.ok) return toast(r.erro, true);
    toast('Registro excluído.');
    route();
  },
  'nova-os': d => novaOS(d.cliente ? { cliente_id: Number(d.cliente), veiculo_id: Number(d.veiculo) } : {}),
  filtro(d) { filtroOS = d.s; route(); },
  status(d) {
    const r = DB.mudarStatus(Number(d.id), d.status);
    if (!r.ok) toast(r.erro, true); else toast('Status atualizado.');
    route();
  },
  imprimir: () => window.print(),
  'os-excluir'(d) {
    if (!confirm('Excluir esta ordem de serviço? Essa ação não pode ser desfeita.')) return;
    const r = DB.remove('ordens', Number(d.id));
    if (!r.ok) return toast(r.erro, true);
    toast('Ordem de serviço excluída.');
    location.hash = '#/os';
  },
  'add-servico': d => addServico(Number(d.id)),
  'add-peca': d => addPeca(Number(d.id)),
  'rm-item'(d) {
    const r = DB.removeItem(Number(d.id), d.kind, d.item);
    if (!r.ok) toast(r.erro, true);
    route();
  },
  restaurar() {
    if (!confirm('Apagar todos os dados e restaurar os dados de exemplo?')) return;
    DB.reset();
    toast('Dados de exemplo restaurados.');
    route();
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
    const r = DB.mudarStatus(Number(el.dataset.statusSelect), el.value);
    if (!r.ok) toast(r.erro, true); else toast('Status atualizado.');
    route();
  } else if (el.dataset.osField) {
    const campo = el.dataset.osField;
    let valor = el.value;
    if (campo === 'garantia_dias' || campo === 'desconto') valor = Math.max(0, Number(valor) || 0);
    DB.update('ordens', Number(el.dataset.id), { [campo]: valor });
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
window.addEventListener('hashchange', route);
route();
