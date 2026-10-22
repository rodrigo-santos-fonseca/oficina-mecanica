# OficinaGest

Protótipo de sistema web para gestão integrada de clientes, veículos, serviços e peças em oficinas mecânicas. Desenvolvido para a disciplina de Engenharia de Software III (FATEC Itapetininga).

Stack: HTML, CSS e JavaScript puro, banco relacional em SQL (PostgreSQL), código no GitHub e hospedagem na Vercel.

## Como executar

Abra o `index.html` no navegador. Não precisa instalar nada.

Para servir como site local:

```bash
npx serve .
```

## Acesso e perfis

O sistema exige login e encerra a sessão após 30 minutos sem atividade. Contas de demonstração:

| Perfil | Usuário | Senha |
| --- | --- | --- |
| Administrador | `admin` | `admin123` |
| Atendente | `atendente` | `atendente123` |
| Mecânico | `carlos` ou `rafael` | `mecanico123` |

| Ação | Administrador | Atendente | Mecânico |
| --- | :---: | :---: | :---: |
| Painel e consulta de ordens de serviço | sim | sim | sim |
| Faturamento, "a receber" e gráfico financeiro no painel | sim | não | não |
| Ver valores (totais, preços e descontos) | sim | sim | **não** |
| Registrar e estornar pagamento da OS | sim | sim | não |
| Orçamentos (criar, aprovar, converter, exportar PDF) | sim | sim | sem acesso |
| Abrir ordem de serviço | sim | sim | não |
| Lançar serviços e peças na OS | sim | sim | sim (serviços só da tabela, sem ver preço) |
| Mudar o status da OS | todas as etapas | todas as etapas | até "Concluída" |
| Definir mecânico, previsão e desconto | sim | sim | não |
| Excluir ordem de serviço | sim | não | não |
| Clientes e veículos | cadastrar e editar | cadastrar e editar | sem acesso |
| Peças (disponível ou indisponível) | cadastrar e editar | cadastrar e editar | só consultar |
| Tabela de mão de obra (serviços) | cadastrar e editar | sem acesso | sem acesso |
| Usuários | gerenciar | sem acesso | sem acesso |

As permissões ficam na constante `PERMS` de `js/app.js`.

> Nesta versão o login roda no próprio navegador, então serve para demonstrar o fluxo e os perfis, mas não protege os dados de verdade. Em produção, a autenticação e as permissões precisam ser validadas no servidor (por exemplo, em funções da pasta `api/` com sessão ou JWT). As senhas já são guardadas apenas como hash (SHA-256 com sal), e a Vercel entrega o site em HTTPS.

## Requisitos atendidos

| Requisito | Onde está no sistema |
| --- | --- |
| RF-01 Clientes | Cadastro, busca, edição e **inativação** de clientes PF e PJ. RNFR-01.1: valida os dígitos verificadores de CPF e CNPJ. RNFR-01.2: busca instantânea por nome, CPF/CNPJ (com ou sem pontuação) e telefone. RNFR-01.3: layout responsivo. |
| RF-02 Veículos | Cadastro com placa, marca, modelo, ano, cor, quilometragem e **chassi**. Placa única, e o proprietário é obrigatório. Botão **Histórico** abre a tela do veículo, com todas as OS e orçamentos dele, a 1 clique da lista (RNFR-02.3). |
| RF-03 Peças | Revisado após o feedback: a peça fica **disponível ou indisponível**, sem controle de quantidade. Peça indisponível só entra na OS como **encomenda**. |
| RF-04 Mão de obra | Serviços com categoria e valor padrão. Somente o administrador altera a tabela (RNFR-04.1). |
| RF-05 Orçamentos | Criação, edição, soma automática, desconto e situação (em elaboração, aguardando aprovação, aprovado, recusado). **Converter em OS** com um clique após aprovado. **Exportar PDF** pela impressão do navegador, além de botões que abrem o e-mail ou o WhatsApp já com o resumo do orçamento (o PDF é anexado à mensagem). |
| RF-06 Ordens de serviço | Status Pendente, Em andamento, Aguardando peça, Concluída e Cancelada. Mecânico responsável, peças lançadas e desconto. Para concluir, exige mecânico, previsão e peças encomendadas já recebidas. Registra data e hora de abertura e de término, previsão e atendente. Encerramento financeiro com forma e data de pagamento (e estorno). O painel se atualiza entre abas abertas do mesmo navegador. |
| RF-07 Painel gerencial | Quadro por etapa, indicadores com **seletor de período** (mês, 3, 6 ou 12 meses) e gráficos de veículos atendidos, OS finalizadas e faturamento. Faturamento e valores a receber só aparecem para o administrador (RNFR-07.2). |
| RF-08 Acesso | Login, três perfis, tela de usuários, senha com hash e sal repetido 5.000 vezes e logout automático após 30 minutos. |

## Regras de negócio

1. Um veículo pertence a um cliente, e a OS e o orçamento só aceitam veículo do cliente escolhido.
2. Placa, chassi, CPF/CNPJ e usuário de acesso não se repetem.
3. Peça disponível entra direto na OS. Peça indisponível só entra se for marcada como encomenda.
4. Ao encomendar uma peça, a OS passa para "Aguardando peça" até alguém marcar a chegada. Com todas as peças recebidas, volta para "Em andamento".
5. A OS não conclui com peça encomendada que não chegou, sem mecânico responsável ou sem previsão de entrega.
6. Com a OS concluída ou cancelada, os itens ficam bloqueados. Com o orçamento aprovado, recusado ou convertido, também.
7. Ao converter um orçamento, os itens e valores combinados são copiados para a OS. Peça indisponível vira encomenda, e a previsão usa o prazo do orçamento.
8. Cadastros com histórico não podem ser excluídos. Clientes podem ser inativados e deixam de aparecer ao abrir OS e orçamentos.
9. A garantia é contada a partir da data de conclusão.
   Uma OS paga não muda de status até o pagamento ser estornado.
10. O sistema sempre mantém ao menos um administrador ativo, e ninguém desativa ou rebaixa o próprio usuário.

## Testes

As regras de negócio têm testes automáticos, sem dependências:

```bash
node tests/regras.test.js
```

Os testes de interface (perfis, permissões, PDF, celular e dados corrompidos) foram feitos no Chromium com Playwright. Firefox e Safari não foram testados no ambiente de desenvolvimento.

## Estrutura

```
index.html       página única com navegação por hash (#/painel, #/os, #/orcamentos, ...)
css/style.css    estilos (responsivo e com folha de impressão)
js/db.js         camada de dados e regras de negócio
js/app.js        telas, formulários, permissões e eventos
sql/schema.sql   modelo relacional em PostgreSQL
tests/           testes das regras de negócio
```

## Sobre os dados

Nesta versão os dados ficam no `localStorage` do navegador, o que basta para demonstrar e avaliar o protótipo com usuários. O botão "Restaurar dados de exemplo" (visível só para o administrador) volta ao estado inicial, inclusive os usuários.

As coleções de `js/db.js` espelham as tabelas de `sql/schema.sql`. Para ligar um banco de verdade, crie um banco PostgreSQL (Neon, Supabase ou Vercel Postgres), execute o `schema.sql`, crie funções serverless na pasta `api/` e troque as funções de `db.js` por chamadas `fetch` a essa API, mantendo os mesmos nomes de função.

A atualização em tempo real do painel para **todos os terminais** (RNFR-06.2) exige esse servidor, por exemplo com Supabase Realtime ou WebSockets. No protótipo ela vale entre abas do mesmo navegador.

## Publicar no GitHub e na Vercel

```bash
git add .
git commit -m "Orçamentos, login, peças disponíveis e requisitos RF-01 a RF-08"
git push
```

Na Vercel, o deploy acontece sozinho a cada push se o repositório já estiver importado. Se ainda não estiver, clique em **Add New > Project**, importe o repositório e finalize em **Deploy**. Por ser um site estático, não é preciso configurar build.

## Onde isso entra no documento do projeto

| Seção do template | O que usar |
| --- | --- |
| 6.1 Requisitos | Tabela "Requisitos atendidos" acima |
| 6.2 UML | Casos de uso: os três perfis e as permissões. Classes e ER: `sql/schema.sql` |
| 6.3 Linguagens e frameworks | HTML, CSS, JavaScript, PostgreSQL, GitHub e Vercel |
| 6.4 Diagrama de Entidade e Relacionamento | Tabelas e chaves de `sql/schema.sql` |
| 7.1 Protótipo | Capturas de tela da aplicação |
| 7.2 Repositório GitHub | Link do repositório criado |
