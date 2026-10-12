'use strict';
/*
  Camada de dados do protótipo.
  Cada coleção espelha uma tabela de sql/schema.sql. Hoje os dados ficam no
  localStorage do navegador; para usar um banco SQL de verdade, troque apenas
  este arquivo por chamadas a uma API (fetch) mantendo as mesmas funções.
*/
const DB = (() => {
  const KEY = 'oficinagest.v1';
  const STATUS = [
    { key: 'aberta', label: 'Aberta' },
    { key: 'em_andamento', label: 'Em andamento' },
    { key: 'aguardando_peca', label: 'Aguardando peça' },
    { key: 'concluida', label: 'Concluída' },
    { key: 'entregue', label: 'Entregue' }
  ];
  const FECHADAS = ['concluida', 'entregue'];
  let data = null;

  const pad = n => String(n).padStart(2, '0');
  const localISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => localISO(new Date());
  const addDays = (iso, n) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return localISO(d);
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const blank = () => ({ seq: {}, clientes: [], veiculos: [], servicos: [], pecas: [], ordens: [] });

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* sem storage: segue em memória */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) { data = null; }
    if (!data || !data.ordens) seed();
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
      if (data.veiculos.some(v => v.cliente_id === id)) return { ok: false, erro: 'Este cliente tem veículos cadastrados. Exclua ou transfira os veículos antes.' };
      if (ordens.some(o => o.cliente_id === id)) return { ok: false, erro: 'Este cliente possui ordens de serviço no histórico.' };
    }
    if (t === 'veiculos' && ordens.some(o => o.veiculo_id === id)) {
      return { ok: false, erro: 'Este veículo possui ordens de serviço no histórico.' };
    }
    if (t === 'pecas' && ordens.some(o => o.itens_peca.some(i => i.peca_id === id))) {
      return { ok: false, erro: 'Esta peça está registrada em ordens de serviço.' };
    }
    if (t === 'ordens') {
      const o = get('ordens', id);
      if (o && o.estoque_baixado) return { ok: false, erro: 'Esta OS já baixou peças do estoque. Volte o status para "Aberta" antes de excluir.' };
    }
    data[t] = data[t].filter(r => r.id !== id);
    save();
    return { ok: true };
  }

  /* ---------- Regras de negócio da ordem de serviço ---------- */
  function totais(o) {
    const servicos = o.itens_servico.reduce((a, i) => a + Number(i.valor), 0);
    const pecas = o.itens_peca.reduce((a, i) => a + i.quantidade * i.preco_unit, 0);
    const desconto = Math.min(Number(o.desconto) || 0, servicos + pecas);
    return { servicos, pecas, desconto, total: servicos + pecas - desconto };
  }

  /* Ao fechar a OS as peças saem do estoque; ao reabrir, voltam. */
  function mudarStatus(id, novo) {
    const o = get('ordens', id);
    if (!o) return { ok: false, erro: 'Ordem de serviço não encontrada.' };
    const fecha = FECHADAS.includes(novo);
    if (fecha && !o.estoque_baixado) {
      if (!o.itens_servico.length && !o.itens_peca.length) {
        return { ok: false, erro: 'Adicione ao menos um serviço ou peça antes de concluir a OS.' };
      }
      for (const it of o.itens_peca) {
        const p = get('pecas', it.peca_id);
        if (!p || p.qtd_estoque < it.quantidade) {
          return { ok: false, erro: `Estoque insuficiente de "${it.descricao}" (disponível: ${p ? p.qtd_estoque : 0}).` };
        }
      }
      o.itens_peca.forEach(it => { get('pecas', it.peca_id).qtd_estoque -= it.quantidade; });
      o.estoque_baixado = true;
      o.data_conclusao = today();
    } else if (!fecha && o.estoque_baixado) {
      o.itens_peca.forEach(it => { const p = get('pecas', it.peca_id); if (p) p.qtd_estoque += it.quantidade; });
      o.estoque_baixado = false;
      o.data_conclusao = null;
    }
    o.status = novo;
    save();
    return { ok: true };
  }

  const travada = o => FECHADAS.includes(o.status);

  function addServico(osId, { descricao, valor }) {
    const o = get('ordens', osId);
    if (!o) return { ok: false, erro: 'Ordem de serviço não encontrada.' };
    if (travada(o)) return { ok: false, erro: 'OS concluída: volte o status para editar os itens.' };
    o.itens_servico.push({ id: uid(), descricao, valor: Number(valor) });
    save();
    return { ok: true };
  }

  function addPeca(osId, pecaId, quantidade) {
    const o = get('ordens', osId);
    const p = get('pecas', pecaId);
    if (!o || !p) return { ok: false, erro: 'Registro não encontrado.' };
    if (travada(o)) return { ok: false, erro: 'OS concluída: volte o status para editar os itens.' };
    quantidade = Number(quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1) return { ok: false, erro: 'Informe uma quantidade inteira maior que zero.' };
    const jaNaOS = o.itens_peca.find(i => i.peca_id === p.id);
    const total = quantidade + (jaNaOS ? jaNaOS.quantidade : 0);
    if (total > p.qtd_estoque) {
      return { ok: false, erro: `Estoque insuficiente: ${p.qtd_estoque} un. disponíveis de "${p.descricao}". Se for aguardar a chegada da peça, deixe a OS como "Aguardando peça" e atualize o estoque no recebimento.` };
    }
    if (jaNaOS) jaNaOS.quantidade = total;
    else o.itens_peca.push({ id: uid(), peca_id: p.id, codigo: p.codigo, descricao: p.descricao, quantidade, preco_unit: p.preco_venda });
    save();
    return { ok: true };
  }

  function removeItem(osId, tipo, itemId) {
    const o = get('ordens', osId);
    if (!o) return { ok: false, erro: 'Ordem de serviço não encontrada.' };
    if (travada(o)) return { ok: false, erro: 'OS concluída: volte o status para editar os itens.' };
    const campo = tipo === 'servico' ? 'itens_servico' : 'itens_peca';
    o[campo] = o[campo].filter(i => i.id !== itemId);
    save();
    return { ok: true };
  }

  function novaOS(dados) {
    return insert('ordens', {
      status: 'aberta', mecanico: '', data_abertura: today(), data_conclusao: null,
      garantia_dias: 0, desconto: 0, observacoes: '', estoque_baixado: false,
      itens_servico: [], itens_peca: [], ...dados
    });
  }

  /* ---------- Dados de exemplo ---------- */
  function seed() {
    data = blank();
    const c1 = insert('clientes', { nome: 'Marcos Antônio Pereira', cpf_cnpj: '529.982.247-25', telefone: '(15) 99812-3344', email: 'marcos.pereira@email.com', endereco: 'Rua das Acácias, 120 – Itapetininga/SP' });
    const c2 = insert('clientes', { nome: 'Juliana Ramos Teixeira', cpf_cnpj: '111.444.777-35', telefone: '(15) 99701-5588', email: 'ju.teixeira@email.com', endereco: 'Av. Peixoto de Castro, 880 – Itapetininga/SP' });
    const c3 = insert('clientes', { nome: 'Transportadora Vale Verde Ltda', cpf_cnpj: '11.222.333/0001-81', telefone: '(15) 3271-4400', email: 'contato@valeverde.com.br', endereco: 'Rodovia SP-127, km 14 – Itapetininga/SP' });

    const v1 = insert('veiculos', { cliente_id: c1.id, placa: 'ABC1D23', marca: 'Fiat', modelo: 'Strada', ano: 2019, cor: 'Branco', km: 78400 });
    const v2 = insert('veiculos', { cliente_id: c2.id, placa: 'RIO2E19', marca: 'Hyundai', modelo: 'HB20', ano: 2021, cor: 'Prata', km: 41250 });
    const v3 = insert('veiculos', { cliente_id: c3.id, placa: 'QWE4R56', marca: 'Volkswagen', modelo: 'Delivery 9.170', ano: 2018, cor: 'Branco', km: 212300 });
    const v4 = insert('veiculos', { cliente_id: c1.id, placa: 'FGH1234', marca: 'Chevrolet', modelo: 'Onix', ano: 2015, cor: 'Preto', km: 112900 });

    const s = {
      oleo: insert('servicos', { descricao: 'Troca de óleo e filtro', valor_padrao: 60 }),
      revisao: insert('servicos', { descricao: 'Revisão completa', valor_padrao: 280 }),
      alinh: insert('servicos', { descricao: 'Alinhamento e balanceamento', valor_padrao: 120 }),
      diag: insert('servicos', { descricao: 'Diagnóstico com scanner', valor_padrao: 150 }),
      freio: insert('servicos', { descricao: 'Troca de pastilhas de freio', valor_padrao: 110 }),
      amort: insert('servicos', { descricao: 'Troca de amortecedores (eixo dianteiro)', valor_padrao: 220 }),
      bateria: insert('servicos', { descricao: 'Troca de bateria', valor_padrao: 40 })
    };

    const p = {
      oleo: insert('pecas', { codigo: 'OL-5W30', descricao: 'Óleo 5W30 sintético (1 L)', preco_custo: 22, preco_venda: 38, qtd_estoque: 24, estoque_minimo: 8 }),
      fOleo: insert('pecas', { codigo: 'FLT-OL01', descricao: 'Filtro de óleo', preco_custo: 14, preco_venda: 29, qtd_estoque: 11, estoque_minimo: 5 }),
      fAr: insert('pecas', { codigo: 'FLT-AR02', descricao: 'Filtro de ar', preco_custo: 18, preco_venda: 39, qtd_estoque: 5, estoque_minimo: 4 }),
      pastilha: insert('pecas', { codigo: 'PST-FR10', descricao: 'Pastilha de freio dianteira (jogo)', preco_custo: 62, preco_venda: 135, qtd_estoque: 5, estoque_minimo: 3 }),
      disco: insert('pecas', { codigo: 'DSC-FR11', descricao: 'Disco de freio dianteiro (par)', preco_custo: 150, preco_venda: 320, qtd_estoque: 3, estoque_minimo: 2 }),
      amort: insert('pecas', { codigo: 'AMT-DT20', descricao: 'Amortecedor dianteiro (unidade)', preco_custo: 190, preco_venda: 360, qtd_estoque: 3, estoque_minimo: 2 }),
      vela: insert('pecas', { codigo: 'VLS-SD30', descricao: 'Vela de ignição (unidade)', preco_custo: 16, preco_venda: 34, qtd_estoque: 20, estoque_minimo: 8 }),
      sonda: insert('pecas', { codigo: 'SND-LB40', descricao: 'Sonda lambda', preco_custo: 210, preco_venda: 420, qtd_estoque: 0, estoque_minimo: 1 }),
      bateria: insert('pecas', { codigo: 'BAT-60A', descricao: 'Bateria 60 Ah', preco_custo: 330, preco_venda: 560, qtd_estoque: 2, estoque_minimo: 2 })
    };

    const sv = x => ({ id: uid(), descricao: x.descricao, valor: x.valor_padrao });
    const pc = (x, q) => ({ id: uid(), peca_id: x.id, codigo: x.codigo, descricao: x.descricao, quantidade: q, preco_unit: x.preco_venda });

    novaOS({ status: 'em_andamento', cliente_id: c1.id, veiculo_id: v1.id, defeito_relatado: 'Barulho na suspensão dianteira ao passar em lombadas.', mecanico: 'Carlos', data_abertura: addDays(today(), -1), itens_servico: [sv(s.amort)], itens_peca: [pc(p.amort, 2)] });
    novaOS({ status: 'aguardando_peca', cliente_id: c2.id, veiculo_id: v2.id, defeito_relatado: 'Luz da injeção acesa e motor falhando em baixa rotação.', mecanico: 'Rafael', data_abertura: addDays(today(), -3), itens_servico: [sv(s.diag)], itens_peca: [pc(p.sonda, 1)], observacoes: 'Sonda lambda encomendada ao fornecedor.' });
    novaOS({ status: 'aberta', cliente_id: c3.id, veiculo_id: v3.id, defeito_relatado: 'Revisão dos 210.000 km: óleo, filtros e verificação dos freios.', mecanico: 'Carlos', data_abertura: today(), itens_servico: [sv(s.revisao)] });
    novaOS({ status: 'concluida', cliente_id: c1.id, veiculo_id: v4.id, defeito_relatado: 'Troca de óleo e filtros.', mecanico: 'Rafael', data_abertura: addDays(today(), -6), data_conclusao: addDays(today(), -5), garantia_dias: 30, estoque_baixado: true, itens_servico: [sv(s.oleo)], itens_peca: [pc(p.oleo, 4), pc(p.fOleo, 1)] });
    novaOS({ status: 'entregue', cliente_id: c2.id, veiculo_id: v2.id, defeito_relatado: 'Ruído ao frear.', mecanico: 'Carlos', data_abertura: addDays(today(), -21), data_conclusao: addDays(today(), -20), garantia_dias: 90, desconto: 10, estoque_baixado: true, itens_servico: [sv(s.freio)], itens_peca: [pc(p.pastilha, 1)] });
    save();
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignora */ }
    seed();
  }

  load();
  return { STATUS, FECHADAS, list, get, insert, update, remove, totais, mudarStatus, addServico, addPeca, removeItem, novaOS, reset, today, addDays };
})();
