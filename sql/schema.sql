-- OficinaGest: modelo relacional (PostgreSQL)
-- Pode ser usado no Neon, Supabase ou Vercel Postgres.
-- Cada tabela corresponde a uma coleção de js/db.js.

CREATE TABLE clientes (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome        VARCHAR(120) NOT NULL,
  cpf_cnpj    VARCHAR(18)  NOT NULL UNIQUE,
  telefone    VARCHAR(20)  NOT NULL,
  email       VARCHAR(120),
  endereco    VARCHAR(200)
);

CREATE TABLE veiculos (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id  INTEGER     NOT NULL REFERENCES clientes(id),
  placa       CHAR(7)     NOT NULL UNIQUE,
  marca       VARCHAR(40) NOT NULL,
  modelo      VARCHAR(60) NOT NULL,
  ano         SMALLINT CHECK (ano BETWEEN 1950 AND 2100),
  cor         VARCHAR(30),
  km          INTEGER NOT NULL DEFAULT 0 CHECK (km >= 0)
);

CREATE TABLE servicos (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descricao     VARCHAR(120)  NOT NULL,
  valor_padrao  NUMERIC(10,2) NOT NULL CHECK (valor_padrao >= 0)
);

CREATE TABLE pecas (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo          VARCHAR(30)   NOT NULL UNIQUE,
  descricao       VARCHAR(120)  NOT NULL,
  preco_custo     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_custo >= 0),
  preco_venda     NUMERIC(10,2) NOT NULL CHECK (preco_venda >= 0),
  qtd_estoque     INTEGER NOT NULL DEFAULT 0 CHECK (qtd_estoque >= 0),
  estoque_minimo  INTEGER NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0)
);

CREATE TABLE ordens_servico (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id),
  veiculo_id        INTEGER NOT NULL REFERENCES veiculos(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'aberta'
                    CHECK (status IN ('aberta','em_andamento','aguardando_peca','concluida','entregue')),
  defeito_relatado  TEXT NOT NULL,
  mecanico          VARCHAR(60),
  data_abertura     DATE NOT NULL DEFAULT CURRENT_DATE,
  data_conclusao    DATE,
  garantia_dias     INTEGER NOT NULL DEFAULT 0 CHECK (garantia_dias >= 0),
  desconto          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  observacoes       TEXT,
  estoque_baixado   BOOLEAN NOT NULL DEFAULT FALSE
);

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
  UNIQUE (os_id, peca_id)
);

CREATE INDEX idx_veiculos_cliente ON veiculos(cliente_id);
CREATE INDEX idx_os_cliente       ON ordens_servico(cliente_id);
CREATE INDEX idx_os_veiculo       ON ordens_servico(veiculo_id);
CREATE INDEX idx_os_status        ON ordens_servico(status);

-- Total de uma OS (serviços + peças - desconto)
CREATE VIEW vw_total_os AS
SELECT o.id AS os_id,
       COALESCE((SELECT SUM(valor) FROM os_servicos s WHERE s.os_id = o.id), 0)
     + COALESCE((SELECT SUM(quantidade * preco_unit) FROM os_pecas p WHERE p.os_id = o.id), 0)
     - o.desconto AS total
FROM ordens_servico o;
