-- =====================================================================
-- AGENDA — compromissos de DEMONSTRAÇÃO
--
-- Cole no SQL Editor do Supabase e execute. Cria compromissos fictícios
-- para você ver as 5 visualizações funcionando enquanto a agenda real
-- ainda está vazia.
--
-- Cobre de propósito os casos difíceis:
--   · dois compromissos no MESMO horário (sobreposição na grade e na timeline)
--   · um evento de 3 DIAS (barra que atravessa a virada de semana no mês)
--   · todos os status (agendado, confirmado, concluído, cancelado, faltou)
--   · um item SEM responsável (linha "Sem responsável" da timeline)
--   · quatro itens SEM DATA (aparecem no painel lateral de não agendados)
--
-- ⚠️ Grava no banco de PRODUÇÃO. Se a equipe já usa a agenda, ela vai ver
--    estes itens. Todo registro leva "[DEMO]" no título — é assim que a
--    limpeza no fim acha o que apagar, sem tocar em compromisso de verdade.
-- =====================================================================

with perfis as (
  -- Numera os perfis ativos para distribuir os compromissos em rodízio.
  select id, sector, (row_number() over (order by created_at) - 1) as n,
         count(*) over () as total
    from public.profiles
   where ativo
),
dados as (
  select * from (values
    -- titulo, tipo, dias, hora, duração, status, dia inteiro, local, agente
    ('Visita — Casa no Jardim Europa','visita',       0,  '09:00'::time,   60,'confirmado',     false,'Rua das Acácias, 240',   0),
    ('Reunião de captação',           'reuniao',      0,  '09:30'::time,   90,'agendado',       false, null,                    1),
    ('Ligação de retorno — proposta', 'ligacao',      0,  '14:00'::time,   30,'agendado',       false, null,                   -1),
    ('Assinatura de contrato',        'assinatura',   1,  '10:00'::time,   60,'confirmado',     false,'Cartório do 2º Ofício',  0),
    ('Gravação de vídeo do imóvel',   'gravacao',     1,  '15:00'::time,  120,'agendado',       false, null,                    2),
    ('Feirão de imóveis',             'outro',        2,  '08:00'::time, 4320,'confirmado',     true, 'Centro de Convenções',   1),
    ('Reunião semanal da equipe',     'reuniao',      3,  '08:00'::time,   60,'agendado',       false, null,                    0),
    ('Visita — Apartamento Centro',   'visita',       4,  '16:00'::time,   45,'agendado',       false, null,                    2),
    ('Retorno ao proprietário',       'retorno',      5,  '11:00'::time,   30,'concluido',      false, null,                    1),
    ('Visita cancelada pelo cliente', 'visita',      -1,  '14:00'::time,   60,'cancelado',      false, null,                    0),
    ('Cliente não compareceu',        'visita',      -2,  '10:00'::time,   60,'nao_compareceu', false, null,                    2),
    ('Vistoria de entrega (feita)',   'outro',       -3,  '09:00'::time,   90,'concluido',      false, null,                    1),
    ('Vistoria de entrega',           'outro',        8,  '09:00'::time,   90,'agendado',       false, null,                    0),
    ('Reunião com investidor',        'reuniao',     11,  '15:00'::time,   60,'agendado',       false, null,                    1),
    ('Visita — Chácara em Itu',       'visita',      14,  '10:00'::time,  180,'agendado',       false, null,                    2),
    -- Sem data (dias = null): painel lateral de não agendados
    ('Avaliar imóvel na Vila Nova',   'visita',    null,  '09:00'::time,   60,'agendado',       false, null,                    0),
    ('Retorno — ligar depois',        'retorno',   null,  '09:00'::time,   30,'agendado',       false, null,                    1),
    ('Fotografar fachada',            'gravacao',  null,  '09:00'::time,   45,'agendado',       false, null,                   -1),
    ('Alinhamento com o jurídico',    'reuniao',   null,  '09:00'::time,   60,'agendado',       false, null,                    2)
  ) as v(titulo, tipo, dias, hora, duracao, status, dia_inteiro, local, agente)
)
insert into public.agenda_events
  (titulo, tipo, data_hora, duracao_min, status, dia_inteiro, local,
   responsavel_id, criado_por, criado_por_sector, observacoes, ordem)
select
  '[DEMO] ' || d.titulo,
  d.tipo,
  -- Hora cravada no fuso de São Paulo. Montar em UTC jogaria os
  -- compromissos da manhã para o dia anterior no calendário.
  case when d.dias is null then null
       else ((current_date + d.dias) + d.hora) at time zone 'America/Sao_Paulo'
  end,
  d.duracao,
  d.status,
  d.dia_inteiro,
  d.local,
  -- Agente -1 fica sem responsável, de propósito.
  case when d.agente < 0 then null else p.id end,
  p.id,
  p.sector,
  'Compromisso de demonstração — apague com o DELETE no fim deste arquivo',
  row_number() over ()
from dados d
join perfis p
  on p.n = abs(d.agente) % p.total;

-- Confere o que entrou:
select titulo, status, data_hora, duracao_min, dia_inteiro
  from public.agenda_events
 where titulo like '[DEMO]%'
 order by data_hora nulls last;


-- =====================================================================
-- PARA APAGAR DEPOIS — rode só esta linha
-- =====================================================================
-- delete from public.agenda_events where titulo like '[DEMO]%';
