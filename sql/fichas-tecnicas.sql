-- Apaga a tabela se já existir uma versão incompleta (seguro rodar de novo)
drop table if exists fichas_tecnicas;

-- Tabela com imagem, uso e ficha técnica de cada item
create table fichas_tecnicas (
  item text primary key,
  imagem_url text,
  descricao text,
  uso text,
  ficha_tecnica_url text,
  produto_url text
);

alter table fichas_tecnicas enable row level security;

-- Qualquer pessoa logada pode consultar
create policy "Leitura para logados"
  on fichas_tecnicas for select
  to authenticated
  using (true);

-- Só o admin pode cadastrar/editar fichas
create policy "Escrita apenas admin"
  on fichas_tecnicas for all
  to authenticated
  using (auth.jwt() ->> 'email' = 'robson_alves1995@live.com')
  with check (auth.jwt() ->> 'email' = 'robson_alves1995@live.com');

-- Todos os itens já identificados no site oficial da Kingspan (meutelhado.com.br)
insert into fichas_tecnicas (item, imagem_url, descricao, uso, ficha_tecnica_url, produto_url) values

('130153', 'https://t56141.vtexassets.com/arquivos/ids/156092-800-auto?v=638150486441000000&width=800&height=auto&aspect=true',
 'Arruela de Vedação NEOBOND ID 1/4 x OD16mm',
 'Usada sob a cabeça do parafuso para vedar o furo de fixação em telhas e chapas metálicas, evitando infiltração de água.',
 'https://downloads.kingspan-isoeste.com.br/catalogos/Kingspan-Isoeste-Cat%C3%A1logo-de-Produtos-PT-BR.pdf',
 'https://www.meutelhado.com.br/arruela-de-vedacao-neobond-id-1-4-x-od16mm/p'),

('144060', 'https://t56141.vtexassets.com/arquivos/ids/158258-800-auto?v=638488689588470000&width=800&height=auto&aspect=true',
 'Massa Vedante na cor Cinza para Telhas - 600ml',
 'Aplicada com pistola para vedar e finalizar junções e acessórios na instalação de isotelhas.',
 'https://downloads.kingspan-isoeste.com.br/catalogos/Kingspan-Isoeste-Cat%C3%A1logo-de-Produtos-PT-BR.pdf',
 'https://www.meutelhado.com.br/massa-vedante-telhas--cinza----600ml-144060/p'),

('144059', 'https://t56141.vtexassets.com/arquivos/ids/158257-800-auto?v=638488689208730000&width=800&height=auto&aspect=true',
 'Massa Vedante na cor Branco Neve para Telhas - 600ml',
 'Aplicada com pistola para vedar e finalizar junções e acessórios na instalação de isotelhas.',
 'https://downloads.kingspan-isoeste.com.br/catalogos/Kingspan-Isoeste-Cat%C3%A1logo-de-Produtos-PT-BR.pdf',
 'https://www.meutelhado.com.br/massa-vedante-telhas--branco----600ml-144059/p'),

('144062', 'https://t56141.vtexassets.com/arquivos/ids/158256-800-auto?v=638488688871030000&width=800&height=auto&aspect=true',
 'Massa Vedante na cor Terracota para Telhas - 600ml',
 'Aplicada com pistola para vedar e finalizar junções e acessórios em telhas na cor terracota (RAL8023).',
 'https://downloads.kingspan-isoeste.com.br/catalogos/Kingspan-Isoeste-Cat%C3%A1logo-de-Produtos-PT-BR.pdf',
 'https://www.meutelhado.com.br/massa-vedante-telhas--ral8023--144062/p'),

('131556i', 'https://t56141.vtexassets.com/arquivos/ids/165710-800-auto?v=639135246056730000&width=800&height=auto&aspect=true',
 'Fita Preta Inferior para Isoluz 50mm x 33m Semipermeável',
 'Fita de vedação aplicada na parte inferior durante a instalação de telhas translúcidas Isoluz, formando barreira semipermeável contra umidade.',
 'https://downloads.kingspan-isoeste.com.br/catalogos/Kingspan-Isoeste-Cat%C3%A1logo-de-Produtos-PT-BR.pdf',
 'https://www.meutelhado.com.br/fita-preta-inferior-para-isoluz-50mm-x-33m-semipermeavel-131556i/p'),

('142797', 'https://t56141.vtexassets.com/arquivos/ids/160997-800-auto?v=638803327286400000&width=800&height=auto&aspect=true',
 'Perfil Andorinha',
 'Perfil metálico de acabamento usado no encontro/junção entre telhas trapezoidais térmicas.',
 'https://downloads.kingspan-isoeste.com.br/catalogos/Kingspan-Isoeste-Cat%C3%A1logo-de-Produtos-PT-BR.pdf',
 'https://www.meutelhado.com.br/perfil-andorinha-prexprimer-142797/p'),

('142913', 'https://t56141.vtexassets.com/arquivos/ids/158262-800-auto?v=638496723357270000&width=800&height=auto&aspect=true',
 'Parafuso para Fixação em Aço - PB 12.1/4-14 X 4 P4',
 'Fixação de isotelhas trapezoidais em estruturas metálicas; acompanha arruela de vedação integrada.',
 'https://downloads.kingspan-isoeste.com.br/catalogos/Kingspan-Isoeste-Cat%C3%A1logo-de-Produtos-PT-BR.pdf',
 'https://www.meutelhado.com.br/parafuso-para-fixacao-em-aco-isotelha-trapezoidal-pb-12-1-4-14-x-4-p4/p'),

('141580', 'https://t56141.vtexassets.com/arquivos/ids/165706-800-auto?v=639106733365870000&width=800&height=auto&aspect=true',
 'Parafuso de Costura para Vedação e Acabamentos PB1/4-14 x 7/8 P1',
 'Usado na sobreposição/costura entre telhas e acabamentos, reforçando a vedação contra vazamentos.',
 'https://downloads.kingspan-isoeste.com.br/catalogos/Kingspan-Isoeste-Cat%C3%A1logo-de-Produtos-PT-BR.pdf',
 'https://www.meutelhado.com.br/parafuso-costura-para-vedacao-de-acabamentos-pb1-4-14-x-7-8-p1/p');
