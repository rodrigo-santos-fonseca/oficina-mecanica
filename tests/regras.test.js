const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const store={};
const ctx={localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}},TextEncoder};
vm.createContext(ctx);
const DB=vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','js','db.js'),'utf8')+';DB',ctx);
let falhas=0; const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c){falhas++;process.exitCode=1}};
for(const s of ['','abc','ação ç','x'.repeat(200)]) ok(DB.sha256(s)===crypto.createHash('sha256').update(s).digest('hex'),'sha256 confere com o Node ('+s.slice(0,6)+')');
ok(DB.autenticar('admin','admin123')?.perfil==='administrador'&&!DB.autenticar('admin','Admin123')&&!DB.autenticar('admin',''),'login exato');
const u=JSON.parse(store['oficinagest.v4']).usuarios[0]; ok(u.senha_hash.length===64&&!JSON.stringify(u).includes('admin123'),'senha só como hash');
// pagamento
const os4=DB.get('ordens',4); ok(os4.status==='concluida'&&!os4.pago_em,'OS 4 concluída e a receber');
ok(!DB.registrarPagamento(1,'Pix',DB.today()).ok,'não paga OS que não está concluída');
ok(!DB.registrarPagamento(4,'Cheque',DB.today()).ok,'forma inválida');
ok(!DB.registrarPagamento(4,'Pix','').ok&&!DB.registrarPagamento(4,'Pix','2099-01-01').ok&&!DB.registrarPagamento(4,'Pix','2000-01-01').ok,'datas inválidas (vazia, futura, antes da abertura)');
ok(DB.registrarPagamento(4,'Pix',DB.today()).ok&&DB.get('ordens',4).forma_pagamento==='Pix','registra pagamento');
ok(!DB.mudarStatus(4,'em_andamento').ok&&!DB.mudarStatus(4,'cancelada').ok,'OS paga não muda de status');
ok(DB.estornarPagamento(4).ok&&DB.mudarStatus(4,'em_andamento').ok,'estorno libera a mudança de status');
DB.mudarStatus(4,'concluida');
// excluir OS religa orçamento
const q=DB.list('orcamentos').find(x=>x.status==='aprovado'); const r=DB.converterOrcamento(q.id,'F'); ok(r.ok,'converte aprovado');
ok(DB.remove('ordens',r.os.id).ok,'exclui a OS gerada'); const q2=DB.get('orcamentos',q.id); ok(q2.status==='aprovado'&&q2.os_id===null,'orçamento volta a aprovado sem OS fantasma');
ok(DB.converterOrcamento(q.id,'F').ok,'pode converter de novo');
// históricos do seed
const seedOS=DB.list('ordens'); ok(seedOS.filter(o=>o.status==='concluida'&&o.pago_em).length>=10&&seedOS.some(o=>o.status==='concluida'&&!o.pago_em),'seed com OS pagas e a receber');
ok(seedOS.every(o=>o.status!=='concluida'||(o.data_conclusao&&o.hora_conclusao&&o.mecanico&&o.previsao_entrega)),'toda OS concluída tem término, mecânico e previsão (RNFR-06.3)');
ok(seedOS.every(o=>o.hora_abertura&&o.aberta_por),'toda OS tem hora de abertura e atendente');
console.log(falhas?`\n${falhas} FALHA(S)`:'\nTudo certo');
