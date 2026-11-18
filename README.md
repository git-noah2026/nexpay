# NEXpay by Andrerer – Das Kassasystem für die Kleinen

Web-Kassa für Cafés, Läden, Werkstätten, Marktstände und Vereinsbuffets – am Tablet, PC oder Handy.
Ausgelegt auf **Österreich**. Teil der NEX-Familie neben [NEXCOUNT](https://github.com/git-noah2026/nexcount).

## Funktionen

- **Kasse:** Artikelkacheln nach Kategorien, Suche (auch nach Artikelnummer/EAN, Enter fügt hinzu),
  freier Betrag, Menge/Preis/Rabatt je Position, Rabatt auf den ganzen Bon, Bon bleibt beim Neuladen erhalten.
- **Bezahlen:** bar mit Rückgeldrechner und Schnellbeträgen, Karte, Sonstige (z. B. Gutschein) –
  auch geteilt (Teil bar, Rest mit Karte). „Bar passend“ mit einem Klick, F9 bzw. Strg+Enter öffnet das Bezahlen.
- **Belege:** fortlaufend nummeriert je Kassa (`K1-000123`), druckbar auf 80-mm-Bondrucker oder A4,
  Suche und Filter, **Storno** über einen Gegenbeleg – der Originalbeleg bleibt unverändert.
- **Trainingsmodus:** Schulungsbuchungen sind am Beleg gekennzeichnet und zählen nicht zum Umsatz.
- **Tagesabschluss (Z-Bericht):** Umsatz, Zahlungsarten, USt-Aufteilung, Einlagen/Entnahmen,
  Soll-Kassenstand, **Kassensturz** mit Zählhilfe je Schein/Münze und Kassendifferenz.
- **Berichte:** Umsatz nach Uhrzeit/Tag/Monat, Top-Artikel, Zahlungsarten, Umsatzsteuer,
  CSV-Export (Belegpositionen) und Belegexport (JSON mit Kettenwerten).
- **Artikel & Kategorien:** Preis brutto, USt 20/13/10/0 %, Farbe je Kategorie, „Preis beim Verkauf eingeben“,
  ausblendbar.
- **Mehrere Kassen** je Unternehmen, jede mit eigener Belegnummer, Umsatzzähler und Abschluss.
- **Team:** Einladungscode, Rollen *Administrator* und *Kassier*; Rechte für Rabatte und Storno einstellbar.
- **Kleinunternehmerregelung:** alle Verkäufe mit 0 % und Hinweis nach § 6 Abs. 1 Z 27 UStG am Beleg.
- Hell/Dunkel, installierbar als App (PWA), Live-Aktualisierung zwischen allen Geräten.

## Registrierkasse (RKSV) – ehrlicher Stand

NEXpay vergibt lückenlose Belegnummern, führt einen Umsatzzähler und **verkettet jeden Beleg per SHA-256
mit dem vorigen** (serverseitig, in einer gesperrten Transaktion). Belege sind für Benutzer unveränderbar.

**NEXpay ist aber noch keine registrierte Registrierkasse nach RKSV.** Dafür fehlen die Anbindung einer
zertifizierten Signaturerstellungseinheit (z. B. A-Trust oder fiskaltrust), der RKSV-QR-Code, Start-/Monats-/
Jahresbelege und das DEP-Format. Betriebe mit Registrierkassenpflicht (ab 15.000 € Jahresumsatz, davon
über 7.500 € bar) dürfen NEXpay bis dahin nur zum Testen bzw. als Trainingskasse verwenden.
Die Angaben ersetzen keine Steuerberatung.

## Aufbau

| Teil          | Dienst                                                                        |
|---------------|-------------------------------------------------------------------------------|
| Anmeldung     | **Supabase Auth** – dasselbe Konto wie in NEXCOUNT                            |
| Datenbank     | **Supabase Postgres** (gleiches Projekt wie NEXCOUNT), Tabellen mit Präfix `pay_` |
| Live-Updates  | **Supabase Realtime** (`pay_orgs.rev`)                                         |
| Oberfläche    | **Cloudflare Workers** (statische Dateien aus `public/`), aus GitHub gebaut   |

Organisationen und Teams sind von NEXCOUNT **getrennt** – nur das Login ist gemeinsam. NEXpay legt
ausschließlich `pay_*`-Tabellen und -Funktionen an und verändert keine NEXCOUNT-Objekte.

Geschrieben wird nur über geprüfte Datenbankfunktionen (`pay_sell`, `pay_storno`, `pay_close`, …);
Row Level Security sorgt dafür, dass jede Organisation nur ihre eigenen Daten sieht.
Beträge werden durchgehend in Cent gespeichert, die USt-Aufteilung rechnet der Server.

## GitHub ⇄ Cloudflare ⇄ Supabase

```
git push (main)
   ├─ .github/workflows/deploy.yml    → prüft die Skripte, veröffentlicht den Worker „nexpay“ zu Cloudflare
   └─ .github/workflows/supabase.yml  → spielt neue Dateien aus supabase/migrations/ in Supabase ein
```

**Warum kein `supabase db push`?** Die Supabase-CLI führt pro Projekt *eine* Migrationsliste. Weil NEXCOUNT
dasselbe Projekt nutzt, würde sie sich über die fremden Einträge beschweren. Der NEXpay-Workflow spielt
seine Dateien deshalb über die Supabase Management API ein und führt eine eigene Liste in
`public.pay_schema_migrations`. Neue Datei anlegen (`supabase/migrations/<Zeitstempel>_<name>.sql`),
pushen, fertig. Bestehende Migrationen nie nachträglich ändern.

### Einmalige Einrichtung

1. **Secrets** (Repo → *Settings → Secrets and variables → Actions*):
   - `SUPABASE_ACCESS_TOKEN` – Supabase → *Account → Access Tokens* (derselbe wie bei NEXCOUNT geht)
   - `CLOUDFLARE_API_TOKEN` – Cloudflare → *My Profile → API Tokens* → Vorlage **„Edit Cloudflare Workers“**
   - `CLOUDFLARE_ACCOUNT_ID` – Cloudflare-Dashboard, Kontoübersicht

   Mit der GitHub-CLI: `gh secret set SUPABASE_ACCESS_TOKEN -R git-noah2026/nexpay` (fragt den Wert ab).
2. **Domain:** Nach dem ersten Deploy im Cloudflare-Dashboard am Worker `nexpay` unter
   *Settings → Domains & Routes* die Custom Domain `nexpay.andrerer.org` eintragen.
3. **Supabase → Authentication → URL Configuration → Redirect URLs:** `https://nexpay.andrerer.org/**`
   ergänzen (für Bestätigungs- und Passwort-Mails). Die *Site URL* bleibt die von NEXCOUNT.
4. [`public/config.js`](public/config.js) enthält *Project URL* und *Publishable key* – beide sind öffentlich
   gedacht. Niemals den `secret`/`service_role` Key ins Repo schreiben!

## Lokal entwickeln

```bash
npm install
npm run dev        # http://localhost:8788 – nutzt das in config.js eingetragene Supabase-Projekt
```

Für lokale Tests `http://localhost:8788/**` unter *Redirect URLs* eintragen.
Supabase-Bibliothek aktualisieren: `npm update @supabase/supabase-js && npm run vendor`.

## Hinweise

- Der Verkauf braucht eine Internetverbindung (Belegnummer und Kette vergibt der Server). Ohne Verbindung
  zeigt NEXpay einen Hinweis; die App selbst startet dank Service Worker auch offline.
- Belege müssen 7 Jahre aufbewahrt werden (§ 132 BAO) – vor dem Löschen einer Organisation den Belegexport sichern.
- Supabase verschickt im kostenlosen Plan nur wenige E-Mails pro Stunde; für den Echtbetrieb eigenen SMTP-Server eintragen.
