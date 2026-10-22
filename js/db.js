'use strict';
/*
  Camada de dados do protótipo.
  Cada coleção espelha uma tabela de sql/schema.sql. Hoje os dados ficam no
  localStorage do navegador; para usar um banco SQL de verdade, troque apenas
  este arquivo por chamadas a uma API (fetch) mantendo as mesmas funções.
*/
const DB = (() => {
  const KEY = 'oficinagest.v4';
  const STATUS = [
    { key: 'pendente', label: 'Pendente' },
    { key: 'em_andamento', label: 'Em andamento' },
    { key: 'aguardando_peca', label: 'Aguardando peça' },
    { key: 'concluida', label: 'Concluída' },
    { key: 'cancelada', label: 'Cancelada' }
  ];
  const ORC_STATUS = [
    { key: 'em_elaboracao', label: 'Em elaboração' },
    { key: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
    { key: 'aprovado', label: 'Aprovado' },
    { key: 'recusado', label: 'Recusado' },
    { key: 'convertido', label: 'Convertido em OS' }
  ];
  const PERFIS = [
    { key: 'administrador', label: 'Administrador' },
    { key: 'atendente', label: 'Atendente' },
    { key: 'mecanico', label: 'Mecânico' }
  ];
  const CATEGORIAS = ['Mecânica geral', 'Elétrica', 'Freios e suspensão', 'Revisão preventiva', 'Pneus e alinhamento'];
  const FORMAS_PAGAMENTO = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito', 'Boleto'];
  const TRAVADAS = ['concluida', 'cancelada'];
  const ORC_TRAVADOS = ['aprovado', 'recusado', 'convertido'];
  let data = null;

  const pad = n => String(n).padStart(2, '0');
  const localISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => localISO(new Date());
  const agora = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const addDays = (iso, n) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return localISO(d);
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const blank = () => ({ seq: {}, usuarios: [], clientes: [], veiculos: [], servicos: [], pecas: [], ordens: [], orcamentos: [] });

  /* SHA-256 síncrono (a senha nunca é guardada em texto puro) */
  const PRIMOS = [];
  for (let n = 2; PRIMOS.length < 64; n++) if (PRIMOS.every(p => n % p)) PRIMOS.push(n);
  const fracao = x => Math.floor((x - Math.floor(x)) * 4294967296);
  const SHA_K = PRIMOS.map(p => fracao(Math.cbrt(p)));
  const SHA_H0 = PRIMOS.slice(0, 8).map(p => fracao(Math.sqrt(p)));
  function sha256(msg) {
    const bytes = [...new TextEncoder().encode(msg)];
    let H = SHA_H0.slice();
    const bits = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map(x => x | 0);
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  /* Hash com sal e 5.000 repetições, para encarecer tentativas de adivinhar a senha */
  function hashSenha(sal, senha) {
    let h = sha256(sal + senha);
    for (let i = 0; i < 5000; i++) h = sha256(h + sal);
    return h;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* sem storage: segue em memória */ }
  }

  /* Relê os dados salvos (usado para sincronizar abas abertas do mesmo navegador) */
  function reload() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) { /* mantém o que está em memória */ }
  }

  function load() {
    data = null;
    reload();
    if (!data || !data.ordens || !data.usuarios || !data.orcamentos) seed();
  }

  /* ---------- CRUD básico ---------- */
  const list = t => data[t].slice();
  const get = (t, id) => data[t].find(r => r.id === Number(id));

  function insert(t, obj) {
    data.seq[t] = (data.seq[t] || 0) + 1;
    const row = { ...obj, id: data.seq[t] };
    data[t].push(row);
    save();
    return row;
  }

  function update(t, id, patch) {
    const r = get(t, id);
    if (!r) return null;
    Object.assign(r, patch);
    save();
    return r;
  }

  /* Exclusão respeitando as chaves estrangeiras do modelo relacional */
  function remove(t, id) {
    id = Number(id);
    const ordens = data.ordens;
    if (t === 'clientes') {
      if (data.veiculos.some(v => v.cliente_id === id)) return { ok: false, erro: 'Este cliente tem veículos cadastrados. Para tirá-lo de uso, inative o cadastro.' };
      if (ordens.some(o => o.cliente_id === id) || data.orcamentos.some(o => o.cliente_id === id)) return { ok: false, erro: 'Este cliente possui ordens de serviço ou orçamentos no histórico. Inative o cadastro em vez de excluir.' };
    }
    if (t === 'veiculos' && (ordens.some(o => o.veiculo_id === id) || data.orcamentos.some(o => o.veiculo_id === id))) {
      return { ok: false, erro: 'Este veículo possui ordens de serviço ou orçamentos no histórico.' };
    }
    if (t === 'pecas' && (ordens.some(o => o.itens_peca.some(i => i.peca_id === id)) || data.orcamentos.some(o => o.itens_peca.some(i => i.peca_id === id)))) {
      return { ok: false, erro: 'Esta peça está registrada em ordens de serviço ou orçamentos. Marque como indisponível em vez de excluir.' };
    }
    if (t === 'orcamentos' && get('orcamentos', id)?.status === 'convertido') {
      return { ok: false, erro: 'Este orçamento já foi convertido em ordem de serviço.' };
    }
    if (t === 'usuarios') {
      const u = get('usuarios', id);
      const admins = data.usuarios.filter(x => x.perfil === 'administrador' && x.ativo);
      if (u && u.perfil === 'administrador' && u.ativo && admins.length <= 1) return { ok: false, erro: 'Mantenha ao menos um administrador ativo.' };
    }
    if (t === 'ordens') data.orcamentos.forEach(q => { if (q.os_id === id) { q.os_id = null; q.status = 'aprovado'; } });
    data[t] = data[t].filter(r => r.id !== id);
    save();
    return { ok: true };
  }

  /* ---------- Usuários e login ---------- */
  function salvarUsuario(id, { nome, login, perfil, ativo, senha }) {
    if (id) {
      const patch = { nome, login, perfil, ativo };
      if (senha) { patch.sal = uid() + uid(); patch.senha_hash = hashSenha(patch.sal, senha); }
      return update('usuarios', id, patch);
    }
    const sal = uid() + uid();
    return insert('usuarios', { nome, login, perfil, ativo, sal, senha_hash: hashSenha(sal, senha) });
  }

  function autenticar(login, senha) {
    const l = String(login || '').trim().toLowerCase();
    const u = data.usuarios.find(x => x.login === l && x.ativo);
    if (!u || u.senha_hash !== hashSenha(u.sal, String(senha || ''))) return null;
    return { id: u.id, nome: u.nome, perfil: u.perfil };
  }

  /* ---------- Totais, itens e regras (valem para OS e orçamento) ---------- */
  function totais(o) {
    const servicos = o.itens_servico.reduce((a, i) => a + Number(i.valor), 0);
    const pecas = o.itens_peca.reduce((a, i) => a + i.quantidade * i.preco_unit, 0);
    const desconto = Math.min(Number(o.desconto) || 0, servicos + pecas);
    return { servicos, pecas, desconto, total: servicos + pecas - desconto };
  }

  const pendentes = o => o.itens_peca.filter(i => i.encomenda && !i.recebida);
  const travada = (o, t) => (t === 'orcamentos' ? ORC_TRAVADOS.includes(o.status) : TRAVADAS.includes(o.status));
  const msgTravada = t => (t === 'orcamentos' ? 'Orçamento já decidido: volte o status para "Aguardando aprovação" para editar os itens.' : 'OS concluída ou cancelada: volte o status para editar os itens.');
  const falha = erro => ({ ok: false, erro });

  function addServico(t, id, { descricao, valor }) {
    const o = get(t, id);
    if (!o) return falha('Registro não encontrado.');
    if (travada(o, t)) return falha(msgTravada(t));
    o.itens_servico.push({ id: uid(), descricao, valor: Number(valor) });
    save();
    return { ok: true };
  }

  /* Na OS: peça disponível entra direto; indisponível só entra como encomenda.
     No orçamento: qualquer peça entra, e a encomenda é decidida ao converter em OS. */
  function addPeca(t, id, pecaId, quantidade, encomendar = false) {
    const o = get(t, id);
    const p = get('pecas', pecaId);
    if (!o || !p) return falha('Registro não encontrado.');
    if (travada(o, t)) return falha(msgTravada(t));
    quantidade = Number(quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1) return falha('Informe uma quantidade inteira maior que zero.');
    const ehOS = t === 'ordens';
    if (ehOS && !p.disponivel && !encomendar) return falha('Peça indisponível. Escolha "Sim, encomendar esta peça" para lançá-la na OS.');
    const enc = ehOS && !p.disponivel;
    const igual = o.itens_peca.find(i => i.peca_id === p.id && !!i.encomenda === enc && !i.recebida);
    if (igual) igual.quantidade += quantidade;
    else o.itens_peca.push({ id: uid(), peca_id: p.id, codigo: p.codigo, descricao: p.descricao, quantidade, preco_unit: p.preco_venda, encomenda: enc, recebida: false });
    if (enc && (o.status === 'pendente' || o.status === 'em_andamento')) o.status = 'aguardando_peca';
    save();
    return { ok: true };
  }

  function receberPeca(osId, itemId) {
    const o = get('ordens', osId);
    const it = o && o.itens_peca.find(i => i.id === itemId);
    if (!it) return falha('Item não encontrado.');
    it.recebida = true;
    if (!pendentes(o).length && o.status === 'aguardando_peca') o.status = 'em_andamento';
    save();
    return { ok: true };
  }

  function removeItem(t, id, tipo, itemId) {
    const o = get(t, id);
    if (!o) return falha('Registro não encontrado.');
    if (travada(o, t)) return falha(msgTravada(t));
    const campo = tipo === 'servico' ? 'itens_servico' : 'itens_peca';
    o[campo] = o[campo].filter(i => i.id !== itemId);
    save();
    return { ok: true };
  }

  /* ---------- Ordem de serviço ---------- */
  function novaOS(dados) {
    return insert('ordens', {
      status: 'pendente', mecanico: '', aberta_por: '', data_abertura: today(), hora_abertura: agora(),
      previsao_entrega: '', data_conclusao: null, hora_conclusao: null, forma_pagamento: null, pago_em: null,
      garantia_dias: 0, desconto: 0, observacoes: '', itens_servico: [], itens_peca: [], ...dados
    });
  }

  /* Para concluir: itens lançados, peças encomendadas recebidas, mecânico e previsão informados
     (a OS encerrada registra abertura, previsão, término e responsável). Não há controle de quantidade em estoque. */
  function mudarStatus(id, novo) {
    const o = get('ordens', id);
    if (!o) return falha('Ordem de serviço não encontrada.');
    if (!STATUS.some(s => s.key === novo)) return falha('Status inválido.');
    if (o.pago_em && novo !== 'concluida') return falha('Esta OS já foi paga. Estorne o pagamento antes de alterar o status.');
    if (novo === 'concluida' && o.status !== 'concluida') {
      if (!o.itens_servico.length && !o.itens_peca.length) return falha('Adicione ao menos um serviço ou peça antes de concluir a OS.');
      const p = pendentes(o);
      if (p.length) return falha(`Ainda há peça encomendada que não chegou: "${p[0].descricao}". Marque como recebida antes de concluir.`);
      if (!o.mecanico) return falha('Defina o mecânico responsável antes de concluir a OS.');
      if (!o.previsao_entrega) return falha('Informe a previsão de entrega antes de concluir a OS.');
      o.data_conclusao = today();
      o.hora_conclusao = agora();
    } else if (novo !== 'concluida') {
      o.data_conclusao = null;
      o.hora_conclusao = null;
    }
    o.status = novo;
    save();
    return { ok: true };
  }

  /* Encerramento financeiro: só OS concluída recebe pagamento */
  function registrarPagamento(id, forma, data) {
    const o = get('ordens', id);
    if (!o) return falha('Ordem de serviço não encontrada.');
    if (o.status !== 'concluida') return falha('Só é possível registrar o pagamento de uma OS concluída.');
    if (!FORMAS_PAGAMENTO.includes(forma)) return falha('Escolha a forma de pagamento.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return falha('Informe a data do pagamento.');
    if (data > today()) return falha('A data do pagamento não pode ser futura.');
    if (data < o.data_abertura) return falha('A data do pagamento não pode ser anterior à abertura da OS.');
    o.forma_pagamento = forma;
    o.pago_em = data;
    save();
    return { ok: true };
  }

  function estornarPagamento(id) {
    const o = get('ordens', id);
    if (!o) return falha('Ordem de serviço não encontrada.');
    o.forma_pagamento = null;
    o.pago_em = null;
    save();
    return { ok: true };
  }

  /* ---------- Orçamento ---------- */
  function novoOrcamento(dados) {
    return insert('orcamentos', {
      status: 'em_elaboracao', data_emissao: today(), validade_dias: 15, prazo_dias: 3, desconto: 0,
      observacoes: '', criado_por: '', itens_servico: [], itens_peca: [], os_id: null, ...dados
    });
  }

  function mudarStatusOrc(id, novo) {
    const o = get('orcamentos', id);
    if (!o) return falha('Orçamento não encontrado.');
    if (o.status === 'convertido') return falha('Este orçamento já foi convertido em ordem de serviço.');
    if (novo === 'convertido') return falha('Use "Converter em OS" para converter o orçamento.');
    if (novo !== 'em_elaboracao' && !o.itens_servico.length && !o.itens_peca.length) return falha('Adicione ao menos um serviço ou peça ao orçamento.');
    o.status = novo;
    save();
    return { ok: true };
  }

  /* Conversão em um clique: copia itens e valores combinados; peça indisponível vira encomenda. */
  function converterOrcamento(id, usuarioNome) {
    const orc = get('orcamentos', id);
    if (!orc) return falha('Orçamento não encontrado.');
    if (orc.status !== 'aprovado') return falha('Só é possível converter um orçamento aprovado.');
    const itens_peca = orc.itens_peca.map(i => {
      const p = get('pecas', i.peca_id);
      return { ...i, id: uid(), encomenda: p ? !p.disponivel : false, recebida: false };
    });
    const os = novaOS({
      cliente_id: orc.cliente_id, veiculo_id: orc.veiculo_id, defeito_relatado: orc.descricao,
      previsao_entrega: addDays(today(), Number(orc.prazo_dias) || 0), desconto: orc.desconto,
      observacoes: `Origem: orçamento ${String(orc.id).padStart(4, '0')}.${orc.observacoes ? ' ' + orc.observacoes : ''}`,
      aberta_por: usuarioNome || '', itens_servico: orc.itens_servico.map(i => ({ ...i, id: uid() })), itens_peca,
      status: itens_peca.some(i => i.encomenda) ? 'aguardando_peca' : 'pendente'
    });
    orc.status = 'convertido';
    orc.os_id = os.id;
    save();
    return { ok: true, os };
  }

  /* ---------- Dados de exemplo ---------- */
  function seed() {
    data = blank();
    salvarUsuario(null, { nome: 'Paulo Andrade', login: 'admin', perfil: 'administrador', ativo: true, senha: 'admin123' });
    salvarUsuario(null, { nome: 'Fernanda Costa', login: 'atendente', perfil: 'atendente', ativo: true, senha: 'atendente123' });
    salvarUsuario(null, { nome: 'Carlos Mendes', login: 'carlos', perfil: 'mecanico', ativo: true, senha: 'mecanico123' });
    salvarUsuario(null, { nome: 'Rafael Lima', login: 'rafael', perfil: 'mecanico', ativo: true, senha: 'mecanico123' });

    const cli = (nome, doc, tel, email, endereco) => insert('clientes', { nome, cpf_cnpj: doc, telefone: tel, email, endereco, ativo: true });
    const c1 = cli('Marcos Antônio Pereira', '529.982.247-25', '(15) 99812-3344', 'marcos.pereira@email.com', 'Rua das Acácias, 120 – Itapetininga/SP');
    const c2 = cli('Juliana Ramos Teixeira', '111.444.777-35', '(15) 99701-5588', 'ju.teixeira@email.com', 'Av. Peixoto de Castro, 880 – Itapetininga/SP');
    const c3 = cli('Transportadora Vale Verde Ltda', '11.222.333/0001-81', '(15) 3271-4400', 'contato@valeverde.com.br', 'Rodovia SP-127, km 14 – Itapetininga/SP');

    const vei = (cliente, placa, marca, modelo, ano, cor, km, chassi) => insert('veiculos', { cliente_id: cliente.id, placa, marca, modelo, ano, cor, km, chassi });
    const v1 = vei(c1, 'ABC1D23', 'Fiat', 'Strada', 2019, 'Branco', 78400, '9BD15822ALB123456');
    const v2 = vei(c2, 'RIO2E19', 'Hyundai', 'HB20', 2021, 'Prata', 41250, '9BHBG51CAMP654321');
    const v3 = vei(c3, 'QWE4R56', 'Volkswagen', 'Delivery 9.170', 2018, 'Branco', 212300, '9533N82T2JR234567');
    const v4 = vei(c1, 'FGH1234', 'Chevrolet', 'Onix', 2015, 'Preto', 112900, '');

    const sk = (descricao, categoria, valor) => insert('servicos', { descricao, categoria, valor_padrao: valor });
    const s = {
      oleo: sk('Troca de óleo e filtro', 'Revisão preventiva', 60),
      revisao: sk('Revisão completa', 'Revisão preventiva', 280),
      alinh: sk('Alinhamento e balanceamento', 'Pneus e alinhamento', 120),
      diag: sk('Diagnóstico com scanner', 'Elétrica', 150),
      freio: sk('Troca de pastilhas de freio', 'Freios e suspensão', 110),
      amort: sk('Troca de amortecedores (eixo dianteiro)', 'Freios e suspensão', 220),
      bateria: sk('Troca de bateria', 'Elétrica', 40)
    };

    const pk = (codigo, descricao, custo, venda, disponivel = true) => insert('pecas', { codigo, descricao, preco_custo: custo, preco_venda: venda, disponivel });
    const p = {
      oleo: pk('OL-5W30', 'Óleo 5W30 sintético (1 L)', 22, 38),
      fOleo: pk('FLT-OL01', 'Filtro de óleo', 14, 29),
      fAr: pk('FLT-AR02', 'Filtro de ar', 18, 39),
      pastilha: pk('PST-FR10', 'Pastilha de freio dianteira (jogo)', 62, 135),
      disco: pk('DSC-FR11', 'Disco de freio dianteiro (par)', 150, 320),
      amort: pk('AMT-DT20', 'Amortecedor dianteiro (unidade)', 190, 360),
      vela: pk('VLS-SD30', 'Vela de ignição (unidade)', 16, 34),
      sonda: pk('SND-LB40', 'Sonda lambda', 210, 420, false),
      bateria: pk('BAT-60A', 'Bateria 60 Ah', 330, 560, false)
    };

    const sv = x => ({ id: uid(), descricao: x.descricao, valor: x.valor_padrao });
    const pc = (x, q, enc = false) => ({ id: uid(), peca_id: x.id, codigo: x.codigo, descricao: x.descricao, quantidade: q, preco_unit: x.preco_venda, encomenda: enc, recebida: false });
    const atend = 'Fernanda Costa';
    const d = n => addDays(today(), n);

    novaOS({ status: 'em_andamento', cliente_id: c1.id, veiculo_id: v1.id, defeito_relatado: 'Barulho na suspensão dianteira ao passar em lombadas.', mecanico: 'Carlos Mendes', aberta_por: atend, hora_abertura: '08:40', previsao_entrega: d(2), data_abertura: d(-1), itens_servico: [sv(s.amort)], itens_peca: [pc(p.amort, 2)] });
    novaOS({ status: 'aguardando_peca', cliente_id: c2.id, veiculo_id: v2.id, defeito_relatado: 'Luz da injeção acesa e motor falhando em baixa rotação.', mecanico: 'Rafael Lima', aberta_por: atend, hora_abertura: '10:15', previsao_entrega: d(5), data_abertura: d(-3), itens_servico: [sv(s.diag)], itens_peca: [pc(p.sonda, 1, true)], observacoes: 'Sonda lambda encomendada ao fornecedor.' });
    novaOS({ status: 'pendente', cliente_id: c3.id, veiculo_id: v3.id, defeito_relatado: 'Revisão dos 210.000 km: óleo, filtros e verificação dos freios.', mecanico: 'Carlos Mendes', aberta_por: atend, previsao_entrega: d(1), itens_servico: [sv(s.revisao)] });
    novaOS({ status: 'concluida', cliente_id: c1.id, veiculo_id: v4.id, defeito_relatado: 'Troca de óleo e filtros.', mecanico: 'Rafael Lima', aberta_por: atend, hora_abertura: '09:05', data_abertura: d(-6), previsao_entrega: d(-5), data_conclusao: d(-5), hora_conclusao: '16:30', garantia_dias: 30, itens_servico: [sv(s.oleo)], itens_peca: [pc(p.oleo, 4), pc(p.fOleo, 1)] });
    novaOS({ status: 'cancelada', cliente_id: c2.id, veiculo_id: v2.id, defeito_relatado: 'Ruído ao frear.', mecanico: 'Carlos Mendes', aberta_por: atend, hora_abertura: '14:20', data_abertura: d(-21), previsao_entrega: d(-19), observacoes: 'Cliente desistiu do serviço.', itens_servico: [sv(s.freio)], itens_peca: [pc(p.pastilha, 1)] });

    /* Histórico dos meses anteriores (alimenta os gráficos do painel) */
    [[-150, c1, v1, s.oleo, [[p.oleo, 4], [p.fOleo, 1]]], [-125, c2, v2, s.alinh, []], [-118, c3, v3, s.revisao, [[p.fAr, 2], [p.fOleo, 2]]],
      [-92, c1, v4, s.freio, [[p.pastilha, 1]]], [-88, c2, v2, s.oleo, [[p.oleo, 4], [p.fOleo, 1]]], [-61, c3, v3, s.diag, []],
      [-57, c1, v1, s.amort, [[p.amort, 2]]], [-33, c2, v2, s.bateria, [[p.bateria, 1]]], [-28, c1, v4, s.alinh, []], [-14, c3, v3, s.oleo, [[p.oleo, 6], [p.fOleo, 1]]]
    ].forEach(([off, c, v, srv, pecas], i) => novaOS({
      status: 'concluida', cliente_id: c.id, veiculo_id: v.id, defeito_relatado: srv.descricao + '.', mecanico: i % 2 ? 'Rafael Lima' : 'Carlos Mendes', aberta_por: atend,
      hora_abertura: '08:40', data_abertura: d(off - 1), previsao_entrega: d(off), data_conclusao: d(off), hora_conclusao: '17:10', garantia_dias: 30,
      forma_pagamento: FORMAS_PAGAMENTO[i % FORMAS_PAGAMENTO.length], pago_em: d(off),
      itens_servico: [sv(srv)], itens_peca: pecas.map(([x, q]) => pc(x, q))
    }));

    novoOrcamento({ cliente_id: c3.id, veiculo_id: v3.id, status: 'aguardando_aprovacao', descricao: 'Substituição das pastilhas e dos discos de freio dianteiros.', criado_por: atend, data_emissao: d(-2), prazo_dias: 2, itens_servico: [sv(s.freio)], itens_peca: [pc(p.pastilha, 1), pc(p.disco, 1)] });
    novoOrcamento({ cliente_id: c1.id, veiculo_id: v4.id, status: 'aprovado', descricao: 'Troca da bateria e revisão do sistema elétrico.', criado_por: atend, data_emissao: d(-1), prazo_dias: 1, desconto: 20, itens_servico: [sv(s.bateria), sv(s.diag)], itens_peca: [pc(p.bateria, 1)] });
    novoOrcamento({ cliente_id: c2.id, veiculo_id: v2.id, descricao: 'Alinhamento e balanceamento das quatro rodas.', criado_por: atend, itens_servico: [sv(s.alinh)] });
    save();
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignora */ }
    seed();
  }

  load();
  return { KEY, STATUS, ORC_STATUS, PERFIS, CATEGORIAS, FORMAS_PAGAMENTO, TRAVADAS, list, get, insert, update, remove, totais, pendentes, mudarStatus, registrarPagamento, estornarPagamento, addServico, addPeca, receberPeca, removeItem, novaOS, novoOrcamento, mudarStatusOrc, converterOrcamento, salvarUsuario, autenticar, reload, reset, today, addDays, sha256 };
})();
