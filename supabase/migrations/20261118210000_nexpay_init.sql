-- =====================================================================
-- NEXpay – Kassasystem by Andrerer – Supabase-Schema (Postgres)
--
-- Läuft im selben Supabase-Projekt wie NEXCOUNT. Alle Objekte tragen das Präfix
-- pay_ und berühren keine NEXCOUNT-Tabellen. Gemeinsam ist nur das Login (auth.users),
-- Organisationen und Teams sind getrennt.
--
-- Eingespielt per GitHub Actions (.github/workflows/supabase.yml) über die
-- Supabase Management API; Buchführung in public.pay_schema_migrations.
-- Wiederholbar: kann gefahrlos auf eine bereits eingerichtete Datenbank laufen.
--
-- Beträge immer in Cent (bigint), Preise brutto.
-- =====================================================================

-- ---------------------------------------------------------------- Tabellen
create table if not exists public.pay_orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  settings   jsonb not null default '{}'::jsonb,
  rev        bigint not null default 0,          -- jede Änderung erhöht rev → Realtime-Signal an alle Geräte
  created_at timestamptz not null default now()
);

create table if not exists public.pay_invites (
  org_id uuid primary key references public.pay_orgs(id) on delete cascade,
  code   text not null unique
);

create table if not exists public.pay_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid not null references public.pay_orgs(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  email      text not null default '',
  role       text not null check (role in ('admin', 'cashier')),
  created_at timestamptz not null default now()
);
create index if not exists pay_members_org_idx on public.pay_members(org_id);

-- Kassen (Registrierkassen) – Belegnummer, Umsatzzähler und Belegkette je Kassa
create table if not exists public.pay_registers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.pay_orgs(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  code         text not null check (code ~ '^[A-Za-z0-9_-]{1,32}$'),   -- Kassen-ID
  receipt_nr   bigint not null default 0,
  turnover     bigint not null default 0,          -- Umsatzzähler (ohne Trainingsbuchungen)
  last_hash    text not null default '',           -- Kettenwert des letzten Belegs
  closing_nr   integer not null default 0,
  cash_start   bigint not null default 0,          -- Kassenstand zu Beginn der laufenden Periode
  period_start timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (org_id, code)
);
create index if not exists pay_registers_org_idx on public.pay_registers(org_id);

create table if not exists public.pay_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.pay_orgs(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  color      text not null default 'emerald' check (color ~ '^[a-z]{1,16}$'),
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists pay_categories_org_idx on public.pay_categories(org_id);

create table if not exists public.pay_products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.pay_orgs(id) on delete cascade,
  category_id uuid references public.pay_categories(id) on delete set null,
  name        text not null check (char_length(name) between 1 and 80),
  price       bigint not null default 0 check (price between 0 and 100000000),
  vat         smallint not null default 20 check (vat in (0, 10, 13, 20)),
  open_price  boolean not null default false,      -- Preis wird beim Verkauf eingegeben
  active      boolean not null default true,
  sku         text not null default '' check (char_length(sku) <= 40),
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pay_products_org_idx on public.pay_products(org_id);

-- Tagesabschlüsse (Z-Berichte)
create table if not exists public.pay_closings (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.pay_orgs(id) on delete cascade,
  register_id uuid not null references public.pay_registers(id) on delete cascade,
  nr          integer not null,
  period_from timestamptz not null,
  period_to   timestamptz not null,
  user_id     uuid,
  user_name   text not null default '',
  summary     jsonb not null,
  expected    bigint not null,
  counted     bigint,
  difference  bigint,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  unique (register_id, nr)
);
create index if not exists pay_closings_org_idx on public.pay_closings(org_id, created_at desc);

-- Belege – werden nie geändert oder gelöscht; Korrektur nur über Stornobelege
create table if not exists public.pay_receipts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.pay_orgs(id) on delete cascade,
  register_id  uuid not null references public.pay_registers(id) on delete cascade,
  nr           bigint not null,
  kind         text not null check (kind in ('sale', 'storno')),
  training     boolean not null default false,
  created_at   timestamptz not null default now(),
  user_id      uuid,
  user_name    text not null default '',
  items        jsonb not null,
  total        bigint not null,
  vat          jsonb not null,
  payments     jsonb not null,
  change_given bigint not null default 0,
  storno_of    uuid references public.pay_receipts(id) on delete set null,
  stornoed_by  uuid,
  closing_id   uuid references public.pay_closings(id) on delete set null,
  note         text not null default '',
  turnover     bigint not null,
  hash         text not null,
  unique (register_id, nr)
);
create index if not exists pay_receipts_org_time_idx on public.pay_receipts(org_id, created_at desc);
create index if not exists pay_receipts_open_idx on public.pay_receipts(register_id) where closing_id is null;

-- Bargeld-Einlagen und -Entnahmen
create table if not exists public.pay_cash_moves (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.pay_orgs(id) on delete cascade,
  register_id uuid not null references public.pay_registers(id) on delete cascade,
  kind        text not null check (kind in ('in', 'out')),
  amount      bigint not null check (amount between 1 and 100000000),
  note        text not null default '',
  user_id     uuid,
  user_name   text not null default '',
  closing_id  uuid references public.pay_closings(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists pay_cash_moves_org_idx on public.pay_cash_moves(org_id, created_at desc);

-- ---------------------------------------------------------------- Hilfsfunktionen
create or replace function public.pay_my_org() returns uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.pay_members where user_id = auth.uid()
$$;

create or replace function public.pay_my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.pay_members where user_id = auth.uid()
$$;

create or replace function public._pay_org() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  select org_id into v_org from public.pay_members where user_id = auth.uid();
  if v_org is null then raise exception 'NO_ORG'; end if;
  return v_org;
end $$;

create or replace function public._pay_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  select org_id into v_org from public.pay_members where user_id = auth.uid() and role = 'admin';
  if v_org is null then raise exception 'Nur für Administratoren.' using errcode = '42501'; end if;
  return v_org;
end $$;

create or replace function public._pay_bump(p_org uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.pay_orgs set rev = rev + 1 where id = p_org
$$;

create or replace function public._pay_user_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select name from public.pay_members where user_id = auth.uid()), '')
$$;

create or replace function public._pay_invite_code() returns text
language sql volatile set search_path = '' as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
$$;

create or replace function public._pay_display_name(p_name text) returns text
language sql stable set search_path = '' as $$
  select left(btrim(coalesce(nullif(btrim(p_name), ''),
                             nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
                             split_part(coalesce(auth.jwt() ->> 'email', 'Kassier'), '@', 1))), 80)
$$;

-- Ganzzahl (Cent) aus JSON lesen, mit Bereichsprüfung
create or replace function public._pay_cents(p jsonb, p_min bigint, p_max bigint, p_label text) returns bigint
language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'number' then raise exception '% ist ungültig.', p_label; end if;
  v := round((p #>> '{}')::numeric);
  if v < p_min or v > p_max then raise exception '% ist ungültig.', p_label; end if;
  return v::bigint;
end $$;

-- ---------------------------------------------------------------- Row Level Security
alter table public.pay_orgs       enable row level security;
alter table public.pay_invites    enable row level security;
alter table public.pay_members    enable row level security;
alter table public.pay_registers  enable row level security;
alter table public.pay_categories enable row level security;
alter table public.pay_products   enable row level security;
alter table public.pay_closings   enable row level security;
alter table public.pay_receipts   enable row level security;
alter table public.pay_cash_moves enable row level security;

drop policy if exists "Eigene Organisation lesen" on public.pay_orgs;
create policy "Eigene Organisation lesen" on public.pay_orgs
  for select to authenticated using (id = public.pay_my_org());

drop policy if exists "Einladungscode nur für Admins" on public.pay_invites;
create policy "Einladungscode nur für Admins" on public.pay_invites
  for select to authenticated using (org_id = public.pay_my_org() and public.pay_my_role() = 'admin');

drop policy if exists "Eigenes Profil, Admins sehen das Team" on public.pay_members;
create policy "Eigenes Profil, Admins sehen das Team" on public.pay_members
  for select to authenticated using (user_id = auth.uid() or (org_id = public.pay_my_org() and public.pay_my_role() = 'admin'));

drop policy if exists "Kassen der Organisation" on public.pay_registers;
create policy "Kassen der Organisation" on public.pay_registers
  for select to authenticated using (org_id = public.pay_my_org());

drop policy if exists "Kategorien der Organisation" on public.pay_categories;
create policy "Kategorien der Organisation" on public.pay_categories
  for select to authenticated using (org_id = public.pay_my_org());

drop policy if exists "Artikel der Organisation" on public.pay_products;
create policy "Artikel der Organisation" on public.pay_products
  for select to authenticated using (org_id = public.pay_my_org());

drop policy if exists "Abschlüsse der Organisation" on public.pay_closings;
create policy "Abschlüsse der Organisation" on public.pay_closings
  for select to authenticated using (org_id = public.pay_my_org());

drop policy if exists "Belege der Organisation" on public.pay_receipts;
create policy "Belege der Organisation" on public.pay_receipts
  for select to authenticated using (org_id = public.pay_my_org());

drop policy if exists "Kassenbewegungen der Organisation" on public.pay_cash_moves;
create policy "Kassenbewegungen der Organisation" on public.pay_cash_moves
  for select to authenticated using (org_id = public.pay_my_org());

-- Schreiben ausschließlich über die geprüften Funktionen unten
revoke all on public.pay_orgs, public.pay_invites, public.pay_members, public.pay_registers, public.pay_categories,
  public.pay_products, public.pay_closings, public.pay_receipts, public.pay_cash_moves from anon;
revoke insert, update, delete, truncate on public.pay_orgs, public.pay_invites, public.pay_members, public.pay_registers,
  public.pay_categories, public.pay_products, public.pay_closings, public.pay_receipts, public.pay_cash_moves from authenticated;

-- ---------------------------------------------------------------- Profil & Organisation
create or replace function public.pay_me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m         public.pay_members%rowtype;
  o         public.pay_orgs%rowtype;
  inv       text;
  mem       jsonb := '[]'::jsonb;
  jwt_email text := auth.jwt() ->> 'email';
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  select * into m from public.pay_members where user_id = auth.uid();
  if not found then
    return jsonb_build_object(
      'user', jsonb_build_object('id', auth.uid(), 'email', jwt_email,
                                 'name', auth.jwt() -> 'user_metadata' ->> 'name', 'role', null),
      'org', null, 'members', '[]'::jsonb);
  end if;
  if jwt_email is not null and jwt_email <> m.email then
    update public.pay_members set email = jwt_email where user_id = m.user_id;
    m.email := jwt_email;
  end if;
  select * into o from public.pay_orgs where id = m.org_id;
  if m.role = 'admin' then
    select code into inv from public.pay_invites where org_id = o.id;
    select coalesce(jsonb_agg(jsonb_build_object('id', x.user_id, 'name', x.name, 'email', x.email, 'role', x.role) order by x.name), '[]'::jsonb)
      into mem from public.pay_members x where x.org_id = o.id;
  end if;
  return jsonb_build_object(
    'user', jsonb_build_object('id', m.user_id, 'name', m.name, 'email', m.email, 'role', m.role),
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'settings', o.settings, 'rev', o.rev)
           || case when inv is not null then jsonb_build_object('inviteCode', inv) else '{}'::jsonb end,
    'members', mem);
end $$;

create or replace function public.pay_create_org(p_name text, p_user_name text default null, p_demo boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  c_drinks uuid; c_food uuid; c_shop uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  if exists (select 1 from public.pay_members where user_id = auth.uid()) then raise exception 'Du gehörst bereits zu einer Organisation.'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if p_name = '' or char_length(p_name) > 120 then raise exception 'Bitte gib einen gültigen Namen für dein Unternehmen an.'; end if;
  insert into public.pay_orgs (name) values (p_name) returning id into v_org;
  insert into public.pay_invites (org_id, code) values (v_org, public._pay_invite_code());
  insert into public.pay_members (user_id, org_id, name, email, role)
    values (auth.uid(), v_org, public._pay_display_name(p_user_name), coalesce(auth.jwt() ->> 'email', ''), 'admin');
  insert into public.pay_registers (org_id, name, code) values (v_org, 'Kassa 1', 'K1');

  if coalesce(p_demo, false) then
    insert into public.pay_categories (org_id, name, color, sort) values (v_org, 'Getränke', 'emerald', 1) returning id into c_drinks;
    insert into public.pay_categories (org_id, name, color, sort) values (v_org, 'Speisen', 'amber', 2) returning id into c_food;
    insert into public.pay_categories (org_id, name, color, sort) values (v_org, 'Shop', 'sky', 3) returning id into c_shop;
    insert into public.pay_products (org_id, category_id, name, price, vat, sort, open_price) values
      (v_org, c_drinks, 'Espresso', 260, 20, 1, false),
      (v_org, c_drinks, 'Melange', 390, 20, 2, false),
      (v_org, c_drinks, 'Cappuccino', 410, 20, 3, false),
      (v_org, c_drinks, 'Mineralwasser 0,33 l', 290, 20, 4, false),
      (v_org, c_drinks, 'Apfelsaft gespritzt 0,5 l', 380, 20, 5, false),
      (v_org, c_food, 'Croissant', 240, 10, 1, false),
      (v_org, c_food, 'Schinken-Käse-Toast', 490, 10, 2, false),
      (v_org, c_food, 'Kuchen des Tages', 390, 10, 3, false),
      (v_org, c_shop, 'Kaffeebohnen 250 g', 990, 10, 1, false),
      (v_org, c_shop, 'Gutschein', 0, 0, 2, true);
  end if;
  return public.pay_me();
end $$;

create or replace function public.pay_join_org(p_code text, p_user_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  if exists (select 1 from public.pay_members where user_id = auth.uid()) then raise exception 'Du gehörst bereits zu einer Organisation.'; end if;
  select org_id into v_org from public.pay_invites where code = upper(btrim(coalesce(p_code, '')));
  if v_org is null then raise exception 'Einladungscode ist ungültig.'; end if;
  insert into public.pay_members (user_id, org_id, name, email, role)
    values (auth.uid(), v_org, public._pay_display_name(p_user_name), coalesce(auth.jwt() ->> 'email', ''), 'cashier');
  perform public._pay_bump(v_org);
  return public.pay_me();
end $$;

create or replace function public.pay_update_profile(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public._pay_org();
begin
  p_name := left(btrim(coalesce(p_name, '')), 80);
  if p_name = '' then raise exception 'Name darf nicht leer sein.'; end if;
  update public.pay_members set name = p_name where user_id = auth.uid();
  return public.pay_me();
end $$;

-- Unternehmensdaten und Belegeinstellungen (nur bekannte Felder werden übernommen)
create or replace function public.pay_update_org(p_name text, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public._pay_admin();
  k     text;
  s     jsonb := '{}'::jsonb;
  text_keys text[] := array['legalName','street','zip','city','phone','email','uid','fn','header','footer'];
  bool_keys text[] := array['smallBusiness','cashierStorno','cashierDiscount'];
begin
  p_name := btrim(coalesce(p_name, ''));
  if p_name = '' or char_length(p_name) > 120 then raise exception 'Bitte gib einen gültigen Namen an.'; end if;
  p_settings := coalesce(p_settings, '{}'::jsonb);
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'Ungültige Einstellungen.'; end if;
  foreach k in array text_keys loop
    if jsonb_typeof(p_settings -> k) = 'string' then
      s := s || jsonb_build_object(k, left(btrim(p_settings ->> k), 400));
    end if;
  end loop;
  foreach k in array bool_keys loop
    if jsonb_typeof(p_settings -> k) = 'boolean' then
      s := s || jsonb_build_object(k, (p_settings -> k));
    end if;
  end loop;
  update public.pay_orgs set name = p_name, settings = s, rev = rev + 1 where id = v_org;
  return public.pay_me();
end $$;

create or replace function public.pay_rotate_invite() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public._pay_admin();
begin
  update public.pay_invites set code = public._pay_invite_code() where org_id = v_org;
  return public.pay_me();
end $$;

create or replace function public.pay_set_role(p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public._pay_admin();
begin
  if p_role not in ('admin', 'cashier') then raise exception 'Ungültige Rolle.'; end if;
  if p_user = auth.uid() then raise exception 'Du kannst deine eigene Rolle nicht ändern.'; end if;
  update public.pay_members set role = p_role where user_id = p_user and org_id = v_org;
  if not found then raise exception 'Benutzer nicht gefunden.'; end if;
  perform public._pay_bump(v_org);
  return public.pay_me();
end $$;

create or replace function public.pay_remove_member(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public._pay_admin();
begin
  if p_user = auth.uid() then raise exception 'Du kannst dich nicht selbst entfernen.'; end if;
  delete from public.pay_members where user_id = p_user and org_id = v_org;
  if not found then raise exception 'Benutzer nicht gefunden.'; end if;
  perform public._pay_bump(v_org);
  return public.pay_me();
end $$;

create or replace function public.pay_leave_org() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org  uuid := public._pay_org();
  v_role text := public.pay_my_role();
begin
  if not exists (select 1 from public.pay_members where org_id = v_org and user_id <> auth.uid()) then
    raise exception 'Du bist das einzige Mitglied. Lösche stattdessen die Organisation.';
  end if;
  if v_role = 'admin' and not exists (select 1 from public.pay_members where org_id = v_org and role = 'admin' and user_id <> auth.uid()) then
    raise exception 'Ernenne zuerst eine andere Person zum Administrator.';
  end if;
  delete from public.pay_members where user_id = auth.uid();
  perform public._pay_bump(v_org);
  return public.pay_me();
end $$;

create or replace function public.pay_delete_org(p_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public._pay_admin();
begin
  if not exists (select 1 from public.pay_orgs where id = v_org and name = btrim(coalesce(p_confirm, ''))) then
    raise exception 'Bitte gib zur Bestätigung den Namen der Organisation genau ein.';
  end if;
  delete from public.pay_orgs where id = v_org;
  return public.pay_me();
end $$;

-- ---------------------------------------------------------------- Stammdaten
create or replace function public.pay_save_register(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org  uuid := public._pay_admin();
  v_id   uuid;
  v_name text := left(btrim(coalesce(p ->> 'name', '')), 60);
  v_code text := upper(btrim(coalesce(p ->> 'code', '')));
  r      public.pay_registers%rowtype;
begin
  if v_name = '' then raise exception 'Bitte gib einen Namen für die Kassa an.'; end if;
  if v_code !~ '^[A-Z0-9_-]{1,32}$' then raise exception 'Die Kassen-ID darf nur Buchstaben, Ziffern, - und _ enthalten (max. 32 Zeichen).'; end if;
  if exists (select 1 from public.pay_registers where org_id = v_org and code = v_code and id is distinct from nullif(p ->> 'id', '')::uuid) then
    raise exception 'Diese Kassen-ID wird bereits verwendet.';
  end if;
  if nullif(p ->> 'id', '') is not null then
    v_id := (p ->> 'id')::uuid;
    -- Die Kassen-ID ist Teil der Belegkette: nach dem ersten Beleg nicht mehr änderbar
    update public.pay_registers
       set name = v_name, code = case when receipt_nr = 0 then v_code else code end
     where id = v_id and org_id = v_org returning * into r;
    if not found then raise exception 'Kassa nicht gefunden.'; end if;
  else
    insert into public.pay_registers (org_id, name, code) values (v_org, v_name, v_code) returning * into r;
  end if;
  perform public._pay_bump(v_org);
  return to_jsonb(r);
end $$;

create or replace function public.pay_save_category(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid := public._pay_admin();
  v_name  text := left(btrim(coalesce(p ->> 'name', '')), 40);
  v_color text := coalesce(nullif(p ->> 'color', ''), 'emerald');
  v_sort  integer := coalesce((p ->> 'sort')::integer, 0);
  r       public.pay_categories%rowtype;
begin
  if v_name = '' then raise exception 'Bitte gib einen Namen für die Kategorie an.'; end if;
  if v_color !~ '^[a-z]{1,16}$' then v_color := 'emerald'; end if;
  if nullif(p ->> 'id', '') is not null then
    update public.pay_categories set name = v_name, color = v_color, sort = v_sort
     where id = (p ->> 'id')::uuid and org_id = v_org returning * into r;
    if not found then raise exception 'Kategorie nicht gefunden.'; end if;
  else
    insert into public.pay_categories (org_id, name, color, sort) values (v_org, v_name, v_color, v_sort) returning * into r;
  end if;
  perform public._pay_bump(v_org);
  return to_jsonb(r);
end $$;

create or replace function public.pay_delete_category(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public._pay_admin();
begin
  delete from public.pay_categories where id = p_id and org_id = v_org;
  perform public._pay_bump(v_org);
end $$;

create or replace function public.pay_save_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid := public._pay_admin();
  v_name  text := left(btrim(coalesce(p ->> 'name', '')), 80);
  v_cat   uuid := nullif(p ->> 'categoryId', '')::uuid;
  v_price bigint := coalesce(public._pay_cents(p -> 'price', 0, 100000000, 'Der Preis'), 0);
  v_vat   smallint := coalesce((p ->> 'vat')::smallint, 20);
  r       public.pay_products%rowtype;
begin
  if v_name = '' then raise exception 'Bitte gib einen Artikelnamen an.'; end if;
  if v_vat not in (0, 10, 13, 20) then raise exception 'Ungültiger Steuersatz.'; end if;
  if v_cat is not null and not exists (select 1 from public.pay_categories where id = v_cat and org_id = v_org) then
    v_cat := null;
  end if;
  if nullif(p ->> 'id', '') is not null then
    update public.pay_products
       set name = v_name, category_id = v_cat, price = v_price, vat = v_vat,
           open_price = coalesce((p ->> 'openPrice')::boolean, false),
           active = coalesce((p ->> 'active')::boolean, true),
           sku = left(btrim(coalesce(p ->> 'sku', '')), 40),
           sort = coalesce((p ->> 'sort')::integer, sort),
           updated_at = now()
     where id = (p ->> 'id')::uuid and org_id = v_org returning * into r;
    if not found then raise exception 'Artikel nicht gefunden.'; end if;
  else
    insert into public.pay_products (org_id, category_id, name, price, vat, open_price, active, sku, sort)
      values (v_org, v_cat, v_name, v_price, v_vat, coalesce((p ->> 'openPrice')::boolean, false),
              coalesce((p ->> 'active')::boolean, true), left(btrim(coalesce(p ->> 'sku', '')), 40),
              coalesce((p ->> 'sort')::integer, (select coalesce(max(sort), 0) + 1 from public.pay_products where org_id = v_org)))
      returning * into r;
  end if;
  perform public._pay_bump(v_org);
  return to_jsonb(r);
end $$;

create or replace function public.pay_delete_product(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public._pay_admin();
begin
  -- Belege enthalten eine Kopie der Artikeldaten; Löschen ist daher unbedenklich
  delete from public.pay_products where id = p_id and org_id = v_org;
  perform public._pay_bump(v_org);
end $$;

-- ---------------------------------------------------------------- Verkauf
-- Kettenwert: SHA-256 über den vorigen Kettenwert und die Belegdaten → nachträgliche Änderungen fallen auf
create or replace function public._pay_hash(p_prev text, p_code text, p_nr bigint, p_ts timestamptz, p_total bigint, p_items jsonb) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(concat_ws('|', p_prev, p_code, p_nr::text,
    to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), p_total::text, p_items::text), 'UTF8')), 'hex')
$$;

create or replace function public._pay_vat(p_items jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('rate', s.rate, 'gross', s.gross, 'tax', t.tax, 'net', s.gross - t.tax) order by s.rate desc), '[]'::jsonb)
    from (select (x ->> 'vat')::int as rate, sum((x ->> 'total')::bigint) as gross
            from jsonb_array_elements(p_items) x group by 1) s,
         lateral (select round(s.gross::numeric * s.rate / (100 + s.rate))::bigint as tax) t
$$;

create or replace function public.pay_sell(p_register uuid, p_items jsonb, p_payments jsonb,
                                           p_training boolean default false, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org    uuid := public._pay_org();
  v_reg    public.pay_registers%rowtype;
  v_set    jsonb;
  v_small  boolean;
  it       jsonb;
  v_items  jsonb := '[]'::jsonb;
  v_total  bigint := 0;
  v_qty    numeric;
  v_price  bigint;
  v_disc   bigint;
  v_vat    int;
  v_line   bigint;
  v_name   text;
  v_pid    text;
  pm       jsonb;
  v_method text;
  v_amount bigint;
  v_pays   jsonb := '{}'::jsonb;
  v_paid   bigint := 0;
  v_cash   bigint := 0;
  v_change bigint;
  v_nr     bigint;
  v_ts     timestamptz := now();
  v_hash   text;
  r        public.pay_receipts%rowtype;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Der Bon ist leer.'; end if;
  if jsonb_array_length(p_items) > 300 then raise exception 'Maximal 300 Positionen pro Beleg.'; end if;
  p_payments := coalesce(p_payments, '[]'::jsonb);
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 10 then raise exception 'Ungültige Zahlung.'; end if;

  select settings into v_set from public.pay_orgs where id = v_org;
  v_small := coalesce((v_set ->> 'smallBusiness')::boolean, false);

  for it in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object' then raise exception 'Ungültige Position.'; end if;
    v_name := left(btrim(coalesce(it ->> 'name', '')), 80);
    if v_name = '' then raise exception 'Bei einer Position fehlt der Name.'; end if;
    if jsonb_typeof(it -> 'qty') <> 'number' then raise exception 'Ungültige Menge bei „%“.', v_name; end if;
    v_qty := round((it ->> 'qty')::numeric, 3);
    if v_qty <= 0 or v_qty > 10000 then raise exception 'Ungültige Menge bei „%“.', v_name; end if;
    v_price := public._pay_cents(it -> 'price', 0, 100000000, 'Der Preis');
    if v_price is null then raise exception 'Bei „%“ fehlt der Preis.', v_name; end if;
    v_disc := coalesce(public._pay_cents(it -> 'discount', 0, 100000000000, 'Der Rabatt'), 0);
    v_line := round(v_qty * v_price)::bigint;
    if v_disc > v_line then raise exception 'Der Rabatt bei „%“ ist höher als der Betrag.', v_name; end if;
    v_line := v_line - v_disc;
    v_vat := case when v_small then 0 else coalesce((it ->> 'vat')::int, 20) end;
    if v_vat not in (0, 10, 13, 20) then raise exception 'Ungültiger Steuersatz bei „%“.', v_name; end if;
    v_pid := case when (it ->> 'productId') ~ '^[0-9a-f-]{36}$' then it ->> 'productId' end;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'productId', v_pid, 'name', v_name, 'qty', v_qty, 'price', v_price, 'discount', v_disc, 'vat', v_vat, 'total', v_line));
    v_total := v_total + v_line;
  end loop;
  if v_total > 100000000 then raise exception 'Der Betrag ist zu hoch.'; end if;

  for pm in select value from jsonb_array_elements(p_payments) loop
    v_method := pm ->> 'method';
    if v_method is null or v_method not in ('cash', 'card', 'other') then raise exception 'Ungültige Zahlungsart.'; end if;
    v_amount := public._pay_cents(pm -> 'amount', 0, 1000000000, 'Der Zahlbetrag');
    if coalesce(v_amount, 0) = 0 then continue; end if;
    v_pays := jsonb_set(v_pays, array[v_method], to_jsonb(coalesce((v_pays ->> v_method)::bigint, 0) + v_amount));
    v_paid := v_paid + v_amount;
    if v_method = 'cash' then v_cash := v_cash + v_amount; end if;
  end loop;
  if v_paid < v_total then raise exception 'Der bezahlte Betrag reicht nicht aus.'; end if;
  v_change := v_paid - v_total;
  if v_change > v_cash then raise exception 'Rückgeld ist nur bei Barzahlung möglich – bitte den genauen Betrag mit Karte buchen.'; end if;

  -- Kassa sperren: Belegnummern und Kette werden lückenlos und geordnet vergeben
  select * into v_reg from public.pay_registers where id = p_register and org_id = v_org for update;
  if not found then raise exception 'Kassa nicht gefunden.'; end if;
  v_nr := v_reg.receipt_nr + 1;
  v_hash := public._pay_hash(v_reg.last_hash, v_reg.code, v_nr, v_ts, v_total, v_items);

  insert into public.pay_receipts (org_id, register_id, nr, kind, training, created_at, user_id, user_name, items, total, vat,
                                   payments, change_given, note, turnover, hash)
    values (v_org, v_reg.id, v_nr, 'sale', coalesce(p_training, false), v_ts, auth.uid(), public._pay_user_name(), v_items, v_total,
            public._pay_vat(v_items),
            (select coalesce(jsonb_agg(jsonb_build_object('method', key, 'amount', value::text::bigint)
                     order by array_position(array['cash','card','other'], key)), '[]'::jsonb) from jsonb_each(v_pays)),
            v_change, left(btrim(coalesce(p_note, '')), 200),
            v_reg.turnover + case when coalesce(p_training, false) then 0 else v_total end, v_hash)
    returning * into r;

  update public.pay_registers
     set receipt_nr = v_nr, last_hash = v_hash, turnover = r.turnover
   where id = v_reg.id;
  perform public._pay_bump(v_org);
  return to_jsonb(r);
end $$;

-- Storno: erzeugt einen Gegenbeleg mit negativen Beträgen; der Originalbeleg bleibt unverändert erhalten
create or replace function public.pay_storno(p_receipt uuid, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid := public._pay_org();
  v_role  text := public.pay_my_role();
  v_set   jsonb;
  o       public.pay_receipts%rowtype;
  v_reg   public.pay_registers%rowtype;
  v_items jsonb;
  v_pays  jsonb;
  v_nr    bigint;
  v_ts    timestamptz := now();
  v_hash  text;
  r       public.pay_receipts%rowtype;
begin
  select * into o from public.pay_receipts where id = p_receipt and org_id = v_org for update;
  if not found then raise exception 'Beleg nicht gefunden.'; end if;
  if o.kind = 'storno' then raise exception 'Ein Stornobeleg kann nicht storniert werden.'; end if;
  if o.stornoed_by is not null then raise exception 'Dieser Beleg wurde bereits storniert.'; end if;
  select settings into v_set from public.pay_orgs where id = v_org;
  if v_role <> 'admin' then
    if not coalesce((v_set ->> 'cashierStorno')::boolean, true) then raise exception 'Stornieren dürfen nur Administratoren.'; end if;
    if o.closing_id is not null then raise exception 'Belege aus abgeschlossenen Tagen dürfen nur Administratoren stornieren.'; end if;
  end if;

  select coalesce(jsonb_agg(x || jsonb_build_object('qty', -((x ->> 'qty')::numeric), 'discount', -((x ->> 'discount')::bigint),
                                                     'total', -((x ->> 'total')::bigint)) order by ord), '[]'::jsonb)
    into v_items from jsonb_array_elements(o.items) with ordinality as t(x, ord);
  -- Rückzahlung: bar wird der tatsächlich behaltene Betrag (gegeben − Rückgeld) erstattet
  select coalesce(jsonb_agg(jsonb_build_object('method', p ->> 'method',
           'amount', -((p ->> 'amount')::bigint - case when p ->> 'method' = 'cash' then o.change_given else 0 end))
           order by ord), '[]'::jsonb)
    into v_pays from jsonb_array_elements(o.payments) with ordinality as t(p, ord)
   where (p ->> 'amount')::bigint - case when p ->> 'method' = 'cash' then o.change_given else 0 end <> 0;

  select * into v_reg from public.pay_registers where id = o.register_id for update;
  v_nr := v_reg.receipt_nr + 1;
  v_hash := public._pay_hash(v_reg.last_hash, v_reg.code, v_nr, v_ts, -o.total, v_items);

  insert into public.pay_receipts (org_id, register_id, nr, kind, training, created_at, user_id, user_name, items, total, vat,
                                   payments, change_given, storno_of, note, turnover, hash)
    values (v_org, v_reg.id, v_nr, 'storno', o.training, v_ts, auth.uid(), public._pay_user_name(), v_items, -o.total,
            public._pay_vat(v_items), v_pays, 0, o.id, left(btrim(coalesce(p_reason, '')), 200),
            v_reg.turnover + case when o.training then 0 else -o.total end, v_hash)
    returning * into r;

  update public.pay_receipts set stornoed_by = r.id where id = o.id;
  update public.pay_registers set receipt_nr = v_nr, last_hash = v_hash, turnover = r.turnover where id = v_reg.id;
  perform public._pay_bump(v_org);
  return to_jsonb(r);
end $$;

-- ---------------------------------------------------------------- Bargeld & Tagesabschluss
create or replace function public.pay_cash_move(p_register uuid, p_kind text, p_amount bigint, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public._pay_org();
  r     public.pay_cash_moves%rowtype;
begin
  if p_kind not in ('in', 'out') then raise exception 'Ungültige Buchung.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then raise exception 'Bitte gib einen gültigen Betrag an.'; end if;
  if not exists (select 1 from public.pay_registers where id = p_register and org_id = v_org) then raise exception 'Kassa nicht gefunden.'; end if;
  insert into public.pay_cash_moves (org_id, register_id, kind, amount, note, user_id, user_name)
    values (v_org, p_register, p_kind, p_amount, left(btrim(coalesce(p_note, '')), 200), auth.uid(), public._pay_user_name())
    returning * into r;
  perform public._pay_bump(v_org);
  return to_jsonb(r);
end $$;

-- Zusammenfassung der offenen Periode einer Kassa (alles seit dem letzten Tagesabschluss)
create or replace function public._pay_summary(p_register uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_reg   public.pay_registers%rowtype;
  v_sales bigint; v_count int; v_storno_count int; v_storno_sum bigint; v_training int;
  v_first bigint; v_last bigint;
  v_pay   jsonb; v_vat jsonb;
  v_cash  bigint; v_in bigint; v_out bigint;
begin
  select * into v_reg from public.pay_registers where id = p_register;

  select coalesce(sum(total) filter (where kind = 'sale'), 0),
         count(*) filter (where kind = 'sale'),
         count(*) filter (where kind = 'storno'),
         coalesce(sum(total) filter (where kind = 'storno'), 0)
    into v_sales, v_count, v_storno_count, v_storno_sum
    from public.pay_receipts where register_id = p_register and closing_id is null and not training;
  select count(*) into v_training from public.pay_receipts where register_id = p_register and closing_id is null and training;
  select min(nr), max(nr) into v_first, v_last from public.pay_receipts where register_id = p_register and closing_id is null;

  -- Zahlungsarten netto (bar abzüglich Rückgeld)
  select coalesce(jsonb_object_agg(method, amount), '{}'::jsonb) into v_pay from (
    select p ->> 'method' as method,
           sum((p ->> 'amount')::bigint) - case when p ->> 'method' = 'cash' then coalesce((
             select sum(change_given) from public.pay_receipts
              where register_id = p_register and closing_id is null and not training), 0) else 0 end as amount
      from public.pay_receipts rc, jsonb_array_elements(rc.payments) p
     where rc.register_id = p_register and rc.closing_id is null and not rc.training
     group by 1) s;

  select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'gross', gross, 'tax', tax, 'net', gross - tax) order by rate desc), '[]'::jsonb)
    into v_vat from (
      select (v ->> 'rate')::int as rate, sum((v ->> 'gross')::bigint) as gross, sum((v ->> 'tax')::bigint) as tax
        from public.pay_receipts rc, jsonb_array_elements(rc.vat) v
       where rc.register_id = p_register and rc.closing_id is null and not rc.training
       group by 1) s;

  v_cash := coalesce((v_pay ->> 'cash')::bigint, 0);
  select coalesce(sum(amount) filter (where kind = 'in'), 0), coalesce(sum(amount) filter (where kind = 'out'), 0)
    into v_in, v_out from public.pay_cash_moves where register_id = p_register and closing_id is null;

  return jsonb_build_object(
    'registerId', v_reg.id, 'registerName', v_reg.name, 'registerCode', v_reg.code,
    'periodFrom', v_reg.period_start, 'periodTo', now(),
    'sales', v_sales, 'count', v_count, 'stornoCount', v_storno_count, 'stornoSum', v_storno_sum,
    'total', v_sales + v_storno_sum, 'trainingCount', v_training,
    'firstNr', v_first, 'lastNr', v_last,
    'payments', v_pay, 'vat', v_vat,
    'cashStart', v_reg.cash_start, 'cashIn', v_in, 'cashOut', v_out,
    'expected', v_reg.cash_start + v_cash + v_in - v_out,
    'turnover', v_reg.turnover, 'lastHash', v_reg.last_hash, 'nextClosingNr', v_reg.closing_nr + 1);
end $$;

create or replace function public.pay_period(p_register uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := public._pay_org();
begin
  if not exists (select 1 from public.pay_registers where id = p_register and org_id = v_org) then raise exception 'Kassa nicht gefunden.'; end if;
  return public._pay_summary(p_register);
end $$;

create or replace function public.pay_close(p_register uuid, p_counted bigint default null, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public._pay_org();
  v_reg public.pay_registers%rowtype;
  v_sum jsonb;
  v_exp bigint;
  r     public.pay_closings%rowtype;
begin
  if p_counted is not null and (p_counted < 0 or p_counted > 10000000000) then raise exception 'Ungültiger Kassenstand.'; end if;
  select * into v_reg from public.pay_registers where id = p_register and org_id = v_org for update;
  if not found then raise exception 'Kassa nicht gefunden.'; end if;
  v_sum := public._pay_summary(p_register);
  v_exp := (v_sum ->> 'expected')::bigint;

  insert into public.pay_closings (org_id, register_id, nr, period_from, period_to, user_id, user_name, summary, expected, counted, difference, note)
    values (v_org, v_reg.id, v_reg.closing_nr + 1, v_reg.period_start, (v_sum ->> 'periodTo')::timestamptz, auth.uid(),
            public._pay_user_name(), v_sum, v_exp, p_counted, case when p_counted is null then null else p_counted - v_exp end,
            left(btrim(coalesce(p_note, '')), 300))
    returning * into r;

  update public.pay_receipts set closing_id = r.id where register_id = v_reg.id and closing_id is null;
  update public.pay_cash_moves set closing_id = r.id where register_id = v_reg.id and closing_id is null;
  update public.pay_registers
     set closing_nr = r.nr, cash_start = coalesce(p_counted, v_exp), period_start = r.period_to
   where id = v_reg.id;
  perform public._pay_bump(v_org);
  return to_jsonb(r);
end $$;

-- ---------------------------------------------------------------- Rechte auf Funktionen
-- Interne Hilfsfunktionen (_pay_*) sind von außen nicht aufrufbar, alle pay_* nur angemeldet.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'pay\_%' or p.proname like '\_pay\_%')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.proname like 'pay\_%' then
      execute format('grant execute on function %s to authenticated', f.sig);
    else
      execute format('revoke execute on function %s from authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- Live-Updates (Supabase Realtime)
-- Jede Änderung erhöht pay_orgs.rev → alle Geräte der Organisation laden die betroffenen Daten neu.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pay_orgs') then
    alter publication supabase_realtime add table public.pay_orgs;
  end if;
end $$;
