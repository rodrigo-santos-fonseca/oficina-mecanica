-- OficinaGest: modelo relacional (PostgreSQL)
-- Pode ser usado no Neon, Supabase ou Vercel Postgres.
-- Cada tabela corresponde a uma coleção de js/db.js.

CREATE TABLE usuarios (                                   -- RF-08
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome        VARCHAR(120) NOT NULL,
  login       VARCHAR(20)  NOT NULL UNIQUE,
  senha_hash  VARCHAR(255) NOT NULL,                      -- nunca guardar a senha em texto puro (RNFR-08.1)
  perfil      VARCHAR(15)  NOT NULL
              CHECK (perfil IN ('administrador','atendente','mecanico')),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE clientes (                                   -- RF-01
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome        VARCHAR(120) NOT NULL,
  cpf_cnpj    VARCHAR(18)  NOT NULL UNIQUE,
  telefone    VARCHAR(20)  NOT NULL,
  email       VARCHAR(120),
  endereco    VARCHAR(200),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE               -- inativação em vez de exclusão
);

CREATE TABLE veiculos (                                   -- RF-02
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id  INTEGER     NOT NULL REFERENCES clientes(id),   -- RNFR-02.2
  placa       CHAR(7)     NOT NULL UNIQUE,                    -- RNFR-02.1
  chassi      CHAR(17)    UNIQUE,
  marca       VARCHAR(40) NOT NULL,
  modelo      VARCHAR(60) NOT NULL,
  ano         SMALLINT CHECK (ano BETWEEN 1950 AND 2100),
  cor         VARCHAR(30),
  km          INTEGER NOT NULL DEFAULT 0 CHECK (km >= 0)
);

CREATE TABLE servicos (                                   -- RF-04
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descricao     VARCHAR(120)  NOT NULL,
  categoria     VARCHAR(40)   NOT NULL,
  valor_padrao  NUMERIC(10,2) NOT NULL CHECK (valor_padrao >= 0)
);

CREATE TABLE pecas (                                      -- RF-03 (revisado: sem controle de quantidade)
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo          VARCHAR(30)   NOT NULL UNIQUE,
  descricao       VARCHAR(120)  NOT NULL,
  preco_custo     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_custo >= 0),
  preco_venda     NUMERIC(10,2) NOT NULL CHECK (preco_venda >= 0),
  disponivel      BOOLEAN NOT NULL DEFAULT TRUE           -- FALSE: só entra na OS como encomenda
);

CREATE TABLE orcamentos (                                 -- RF-05
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id     INTEGER NOT NULL REFERENCES clientes(id),
  veiculo_id     INTEGER NOT NULL REFERENCES veiculos(id),
  criado_por     INTEGER REFERENCES usuarios(id),
  status         VARCHAR(25) NOT NULL DEFAULT 'em_elaboracao'
                 CHECK (status IN ('em_elaboracao','aguardando_aprovacao','aprovado','recusado','convertido')),
  descricao      TEXT NOT NULL,
  data_emissao   DATE NOT NULL DEFAULT CURRENT_DATE,
  validade_dias  INTEGER NOT NULL DEFAULT 15 CHECK (validade_dias > 0),
  prazo_dias     INTEGER NOT NULL DEFAULT 3  CHECK (prazo_dias > 0),
  desconto       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  observacoes    TEXT,
  os_id          INTEGER                                  -- preenchido na conversão (FK adicionada abaixo)
);

CREATE TABLE orcamento_servicos (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orcamento_id  INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  descricao     VARCHAR(120)  NOT NULL,
  valor         NUMERIC(10,2) NOT NULL CHECK (valor >= 0)
);

CREATE TABLE orcamento_pecas (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orcamento_id  INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  peca_id       INTEGER NOT NULL REFERENCES pecas(id),
  quantidade    INTEGER NOT NULL CHECK (quantidade > 0),
  preco_unit    NUMERIC(10,2) NOT NULL CHECK (preco_unit >= 0)
);

CREATE TABLE ordens_servico (                             -- RF-06
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id),
  veiculo_id        INTEGER NOT NULL REFERENCES veiculos(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','em_andamento','aguardando_peca','concluida','cancelada')),
  defeito_relatado  TEXT NOT NULL,
  mecanico_id       INTEGER REFERENCES usuarios(id),        -- no protótipo é guardado o nome do mecânico
  aberta_por        INTEGER REFERENCES usuarios(id),        -- responsável pelo atendimento
  aberta_em         TIMESTAMP NOT NULL DEFAULT NOW(),       -- RNFR-06.3: abertura
  previsao_entrega  DATE NOT NULL,                          -- RNFR-06.3: previsão
  concluida_em      TIMESTAMP,                              -- RNFR-06.3: término
  forma_pagamento   VARCHAR(20) CHECK (forma_pagamento IN ('Dinheiro','Pix','Cartão de débito','Cartão de crédito','Boleto')),
  pago_em           DATE,                                   -- encerramento financeiro (RF-06)
  garantia_dias     INTEGER NOT NULL DEFAULT 0 CHECK (garantia_dias >= 0),
  desconto          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  observacoes       TEXT,
  CHECK (status <> 'concluida' OR (concluida_em IS NOT NULL AND mecanico_id IS NOT NULL)),
  CHECK ((forma_pagamento IS NULL) = (pago_em IS NULL))
);

ALTER TABLE orcamentos ADD CONSTRAINT fk_orcamento_os FOREIGN KEY (os_id) REFERENCES ordens_servico(id);

CREATE TABLE os_servicos (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  os_id       INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  descricao   VARCHAR(120)  NOT NULL,
  valor       NUMERIC(10,2) NOT NULL CHECK (valor >= 0)
);

CREATE TABLE os_pecas (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  os_id       INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  peca_id     INTEGER NOT NULL REFERENCES pecas(id),
  quantidade  INTEGER NOT NULL CHECK (quantidade > 0),
  preco_unit  NUMERIC(10,2) NOT NULL CHECK (preco_unit >= 0),
  encomenda   BOOLEAN NOT NULL DEFAULT FALSE,             -- peça indisponível encomendada para esta OS
  recebida    BOOLEAN NOT NULL DEFAULT FALSE              -- chegou da encomenda
);

CREATE INDEX idx_veiculos_cliente ON veiculos(cliente_id);
CREATE INDEX idx_os_cliente       ON ordens_servico(cliente_id);
CREATE INDEX idx_os_veiculo       ON ordens_servico(veiculo_id);
CREATE INDEX idx_os_status        ON ordens_servico(status);
CREATE INDEX idx_orc_cliente      ON orcamentos(cliente_id);

-- Total de uma OS (serviços + peças - desconto)
CREATE VIEW vw_total_os AS
SELECT o.id AS os_id,
       COALESCE((SELECT SUM(valor) FROM os_servicos s WHERE s.os_id = o.id), 0)
     + COALESCE((SELECT SUM(quantidade * preco_unit) FROM os_pecas p WHERE p.os_id = o.id), 0)
     - o.desconto AS total
FROM ordens_servico o;

-- Total de um orçamento
CREATE VIEW vw_total_orcamento AS
SELECT q.id AS orcamento_id,
       COALESCE((SELECT SUM(valor) FROM orcamento_servicos s WHERE s.orcamento_id = q.id), 0)
     + COALESCE((SELECT SUM(quantidade * preco_unit) FROM orcamento_pecas p WHERE p.orcamento_id = q.id), 0)
     - q.desconto AS total
FROM orcamentos q;
