# OficinaGest

Protótipo de sistema web para gestão integrada de clientes, veículos, serviços e peças em oficinas mecânicas. Desenvolvido para a disciplina de Engenharia de Software III (FATEC Itapetininga).

Stack: HTML, CSS e JavaScript puro, banco relacional em SQL (PostgreSQL), código no GitHub e hospedagem na Vercel.

## Como executar

Abra o `index.html` no navegador. Não precisa instalar nada.

Para servir como site local:

```bash
npx serve .
```

## Funcionalidades

- **Painel:** quadro com as ordens de serviço por etapa (Aberta, Em andamento, Aguardando peça, Concluída), indicadores do mês e alerta de estoque baixo.
- **Clientes:** cadastro com validação de CPF/CNPJ, telefone e e-mail.
- **Veículos:** vinculados ao proprietário, com placa no padrão antigo ou Mercosul e placa única.
- **Serviços:** catálogo de mão de obra com valor padrão.
- **Peças e estoque:** preço de custo e de venda, estoque mínimo e aviso de estoque baixo.
- **Ordens de serviço:** abertura por cliente e veículo, lançamento de serviços e peças, desconto, garantia, andamento por status e impressão.

## Regras de negócio implementadas

1. Um veículo pertence a um cliente, e a OS só aceita veículo do cliente escolhido.
2. Placa e CPF/CNPJ não se repetem.
3. Peças só entram na OS se houver estoque suficiente.
4. Ao concluir a OS, as peças saem do estoque. Se a OS for reaberta, elas voltam.
5. Com a OS concluída, os itens ficam bloqueados para edição.
6. Cadastros com histórico não podem ser excluídos (cliente com veículos, veículo ou peça usados em OS).
7. A garantia é calculada a partir da data de conclusão.

## Estrutura

```
index.html       página única com navegação por hash (#/painel, #/os, ...)
css/style.css    estilos (responsivo e com folha de impressão)
js/db.js         camada de dados e regras de negócio
js/app.js        telas, formulários e eventos
sql/schema.sql   modelo relacional em PostgreSQL
```

## Sobre os dados

Nesta versão os dados ficam no `localStorage` do navegador, o que basta para demonstrar e avaliar o protótipo com usuários. O botão "Restaurar dados de exemplo" na barra lateral volta ao estado inicial.

As coleções de `js/db.js` espelham as tabelas de `sql/schema.sql`. Para ligar um banco de verdade, crie um banco PostgreSQL (Neon, Supabase ou Vercel Postgres), execute o `schema.sql`, crie funções serverless na pasta `api/` e troque as funções de `db.js` por chamadas `fetch` a essa API, mantendo os mesmos nomes de função.

## Publicar no GitHub e na Vercel

```bash
git init
git add .
git commit -m "Protótipo OficinaGest"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/oficinagest.git
git push -u origin main
```

Na Vercel, clique em **Add New > Project**, importe o repositório e finalize em **Deploy**. Por ser um site estático, não é preciso configurar build.

## Onde isso entra no documento do projeto

| Seção do template | O que usar |
| --- | --- |
| 6.4 Diagrama de Entidade e Relacionamento | Tabelas e chaves de `sql/schema.sql` |
| 6.1 Requisitos funcionais | Lista de funcionalidades acima |
| 6.1 Requisitos não funcionais | Responsividade, validação de dados, impressão e acessibilidade por teclado |
| 6.3 Linguagens e frameworks | HTML, CSS, JavaScript, PostgreSQL, GitHub e Vercel |
| 7.1 Protótipo | Capturas de tela da aplicação |
| 7.2 Repositório GitHub | Link do repositório criado |
