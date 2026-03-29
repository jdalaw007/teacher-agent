# Soulad aplikace Teacher Agent se Směrnicí o využívání nástrojů AI na ZŠ Trojská

**Dokument připraven:** 2026-03-29
**Verze aplikace:** commit a63763d (nasazeno na Vercel)
**Účel:** Přehled toho, kde Směrnice o využívání AI na ZŠ Trojská klade požadavky a jak je aplikace Teacher Agent splňuje.

Každý bod je označen:
✅ Splněno technicky
⚠️ Částečně splněno nebo vyžaduje opatření na úrovni školy
❌ Nesplněno — vyžaduje pozornost

---

## Čl. 1 — Účel a zásady ochrany osobních údajů (GDPR)

> *„zajistit ochranu osobních údajů v souladu s GDPR (EU 2016/679)"*
> *„chránit žáky jako zranitelnou skupinu"*

### ✅ Systém krycích jmen (pseudonymizace)

Každému žákovi je při importu třídního seznamu automaticky přiřazeno krycí jméno — název zvířete odpovídající prvnímu písmenu příjmení (např. Dvořák → **Delfín**, Šimůnek → **Sova**). Krycí jména jsou generována v jazyce nastaveném v profilu učitele (čeština, angličtina, španělština, francouzština, ruština).

**Technická realizace:**
- `backend/app/services/codenames.py` — přiřazení krycích jmen
- `backend/app/services/pseudonymize.py` — při každém volání AI nástroje jsou skutečná jména nahrazena krycími jmény dříve, než jsou data odeslána do OpenAI
- Skutečná jména žáků **nikdy neopustí backend** v rámci AI volání

### ✅ Právo na výmaz (GDPR čl. 17)

Aplikace implementuje endpoint `DELETE /erase/students/{id}` pro výmaz všech dat konkrétního žáka a `DELETE /erase/account` pro úplné smazání účtu učitele.

### ✅ Automatická retence a mazání dat

Nočně běžící úloha (`retention.py`) automaticky maže data po uplynutí retenční lhůty:
- Záznamy žáků: 730 dní od poslední aktivity
- Konverzace a zprávy: 90 dní po ukončení konverzace
- Episodické a sémantické paměti: 730 dní

### ✅ Export dat (GDPR čl. 20 — přenositelnost)

Endpoint `GET /export/my-data` a tlačítko „Stáhnout moje data" v Nastavení.

### ✅ Protokol přístupu (audit log)

Veškerý přístup k datům žáků je zaznamenán v tabulce `audit_log`. Dostupné přes `GET /audit/log` a `GET /audit/log/student/{id}`.

### ✅ Oznámení o zpracování dat v aplikaci

Sekce „Ochrana soukromí a využití dat" dostupná v Nastavení aplikace. Šablony DPA pro školu a informační list pro zákonné zástupce jsou připraveny v složce `legal/`.

### ⚠️ Šifrování databáze v klidu

SQLite databáze na serveru Railway není šifrována. Doporučeno jako P2 opatření před plným nasazením.

### ⚠️ Podepisání DPA s OpenAI

Před nasazením do produkce je nutno podepsat Data Processing Addendum s OpenAI Ireland Limited (openai.com/policies/data-processing-addendum).

---

## Čl. 3.1 — Obecné zásady: AI jako podpůrný nástroj

> *„AI je podpůrný nástroj ve výuce"*
> *„AI by neměl být nástrojem pro hodnocení žáků"*
> *„AI nesmí nahrazovat pedagogický úsudek"*
> *„AI nesmí být použita k profilování žáků ani k automatizovanému rozhodování"*

### ✅ Asistent hodnocení — návrhy, nikoli rozhodnutí

Funkce „Asistent hodnocení" generuje **návrhy** známek jako koncepty v Google Classroom. Koncepty jsou viditelné pouze pro učitele — žáci je nevidí, dokud je učitel ručně neschválí a nezveřejní. Aplikace žádnou známku nezveřejňuje automaticky.

Potvrzovací dialog před uložením návrhů výslovně upozorňuje:
*„Jedná se pouze o návrhy AI — nikoli o oficiální hodnocení. Oficiálním záznamem je školní klasifikační systém (Škola Online). Vždy zkontrolujte návrhy před zveřejněním."*

### ✅ Žádné automatizované rozhodování

Aplikace neprovádí žádné automatizované rozhodnutí s právním nebo podobným účinkem vůči žákům. Všechny AI výstupy (hodnocení, zpětná vazba, oznámení) procházejí schválením učitele.

### ✅ Žádné profilování žáků

Aplikace nestaví žádné prediktivní profily žáků ani neklasifikuje žáky do rizikových kategorií. Data žáků (jméno, e-mail, poznámky, odevzdané úkoly) slouží výhradně k podpoře učitele při přípravě výuky.

---

## Čl. 3.1 — Označení výstupů AI

> *„Výstupy AI musí být označeny jako ‚vygenerované AI'"*

### ✅ Automatické označení [AI Generated]

Veškerý obsah publikovaný do Google Classroom prostřednictvím aplikace — úkoly, oznámení, naplánované příspěvky — je automaticky označen textem **[AI Generated]** na začátku popisu nebo zprávy.

**Technická realizace:**
- `backend/app/services/chat_agent.py` — `post_assignment` a `post_announcement` nástroje
- `backend/app/services/scheduled_posts.py` — naplánované příspěvky

---

## Čl. 3.3 — Práce pedagogů s AI

> *„Pedagogové musí kriticky posuzovat výstupy"*
> *„Učitel musí vždy znát zdroj a způsob vytvoření materiálů"*

### ✅ Potvrzovací kroky před publikací

Před každým odesláním obsahu do Google Classroom (manuálním i automatickým) je zobrazen potvrzovací dialog. Učitel musí aktivně potvrdit každou akci.

### ✅ Transparentní označení AI obsahu

Veškerý AI-generovaný obsah nese viditelné označení [AI Generated] — učitel i žáci okamžitě vidí, co bylo vytvořeno nástrojem AI.

### ✅ Detekce AI v odevzdaných pracích

Asistent hodnocení obsahuje AI-detekční skóre (1–10) pro každou odevzdanou práci — učiteli pomáhá identifikovat, zda žák mohl k vypracování použít AI.

---

## Čl. 4.1 — Zákaz vkládání osobních údajů do AI

> *„Do veřejně dostupných AI systémů je zakázáno vkládat: osobní údaje žáků, informace o chování, hodnocení, prospěchu, zvláštní kategorie osobních údajů"*

### ✅ Pseudonymizace před odesláním do OpenAI

Skutečná jména, e-mailové adresy a surové poznámky žáků jsou **odstraněny z dat** dříve, než jsou odeslána do OpenAI. AI pracuje pouze s krycími jmény a anonymizovanými výsledky.

**Technická realizace:** `pseudonymize.py` — funkce `safe_student_for_llm()` a `anonymize_text()`

### ✅ Krycí jména při hlasovém vstupu

Tlačítko mikrofonu v aplikaci zobrazuje upozornění:
*„Hlasový vstup — používejte krycí jména žáků, ne jejich skutečná jména."*

### ⚠️ Citlivé údaje (SEN, zdravotní stav)

Pole „poznámky" u profilu žáka může obsahovat citlivé údaje, pokud je učitel zadá. Tato data jsou v současnosti pseudonymizována (e-mail a jméno jsou odstraněny), ale obsah poznámek je stále odesílán do AI v anonymizované podobě.

**Doporučení:** Škola by měla učitele instruovat, aby do pole poznámek nevkládali zvláštní kategorie osobních údajů (zdravotní stav, SEN diagnózy apod.). Do budoucna je plánováno technické oddělení citlivých polí.

---

## Čl. 4.2 — Zásady GDPR

> *Minimalizace dat, omezení účelu, integrita a důvěrnost, transparentnost*

### ✅ Minimalizace dat

AI nástroje dostávají pouze minimum dat nezbytné pro daný úkol — krycí jméno, počet odevzdání, průměrná známka. Jméno, e-mail a poznámky jsou odstraněny z AI kontextu.

### ✅ Omezení účelu

Data žáků jsou používána výhradně pro vzdělávací účely v rámci třídy příslušného učitele. Každý dotaz do databáze je filtrován přes `teacher_user_id` — učitel nemá přístup k datům jiných učitelů.

### ✅ Integrita a důvěrnost

- Přihlášení výhradně přes Google OAuth 2.0 — žádná hesla nejsou ukládána v aplikaci
- Veškerá komunikace přes HTTPS (Railway + Vercel)
- Google tokeny jsou uchovávány pouze na serveru, nikoli v prohlížeči
- OpenAI API klíč je šifrován na úrovni databáze, není odesílán do frontendu

### ✅ Transparentnost

- Oznámení o zpracování dat v sekci Nastavení
- Audit log přístupný pro přehled zpracování
- Označení [AI Generated] na publikovaném obsahu
- Šablony DPA a informační list pro zákonné zástupce v `legal/`

---

## Čl. 4.3 — Bezpečnostní opatření

> *„Přístupy k AI systémům musí být chráněny (heslo, MFA pokud dostupné)"*

### ✅ Google OAuth 2.0

Přihlášení do aplikace probíhá výhradně přes Google účet. MFA je řízeno nastavením Google účtu učitele — škola může vynutit MFA přes Google Workspace Admin.

### ⚠️ MFA na úrovni školy

Vícefaktorové přihlašování závisí na nastavení Google Workspace školy. Škola by měla zajistit, aby MFA bylo vynuceno pro všechny pedagogické účty.

---

## Čl. 5 — ICT koordinátor / zpracování osobních údajů poskytovatelem

> *„sleduje, jak má poskytovatel zpracován závazek zpracování osobních údajů"*
> *„sleduje, kde poskytovatel uchovává osobní údaje"*
> *„doporučuje nástroje, které mají data oddělena a nepoužívají se k trénování modelu"*

### ✅ OpenAI — nulová politika trénování

OpenAI API provoz se nepoužívá k trénování modelů (potvrzeno v DPA). Data odeslaná přes API jsou zpracována pouze pro generování odpovědi.

### ✅ Hostingové služby v EU

- Backend (Railway): nasazen v EU regionu
- Frontend (Vercel): žádná osobní data nejsou ukládána na Vercel

### ⚠️ DPA dokumentace — úkoly pro ICT koordinátora

| Poskytovatel | Stav | Akce |
|---|---|---|
| OpenAI Ireland Ltd | DPA k podpisu | Podepsat na openai.com/policies/data-processing-addendum |
| Google (Workspace for Education) | DPA pravděpodobně pokryto školní licencí | Ověřit s IT správcem školy |
| Railway | DPA dostupné | Podepsat před nasazením |
| Vercel | DPA dostupné | Podepsat (nízké riziko — žádná osobní data) |

---

## Čl. 6 — Etické zásady

> *„AI nesmí být využívána k podvádění (automatické vypracování úkolu)"*
> *„Výstupy AI musí být ověřeny a posouzeny"*

### ✅ Aplikace je určena výhradně pro pedagogy

Teacher Agent je nástroj pro učitele — žáci k němu nemají přístup. Žáci nemohou aplikaci použít k automatickému vypracování úkolů.

### ✅ Detekce AI-generovaného obsahu v odevzdaných pracích

Asistent hodnocení zahrnuje detekci AI-generovaného obsahu (skóre 1–10) pro každou odevzdanou práci. Učitel je tak upozorněn na možné podvádění.

---

## Čl. 8 — Incidenty a hlášení

> *„Pedagog je povinen incident okamžitě nahlásit"*
> *„Bezpečnostním incidentem je zejména: vložení osobních údajů do AI, únik dat"*

### ✅ Audit log

Veškerý přístup k datům žáků je zaznamenáván v `audit_log` tabulce. V případě incidentu je možné zpětně dohledat, kdy a ke kterým datům bylo přistoupeno.

### ⚠️ Postup hlášení incidentů

Technická infrastruktura pro detekci incidentů je na místě (audit log). Postup hlášení — komu, jakým způsobem a v jakém časovém rámci — musí škola definovat ve své interní GDPR směrnici a seznámit s ním pedagogy.

Připomínka: GDPR vyžaduje hlášení úniku dat ÚOOÚ do **72 hodin** od zjištění.

---

## Souhrnná tabulka

| Požadavek směrnice | Stav | Poznámka |
|---|---|---|
| Pseudonymizace žáků před AI zpracováním | ✅ | Krycí jména + `pseudonymize.py` |
| Žádné automatizované rozhodování | ✅ | Vše vyžaduje schválení učitelem |
| Označení AI výstupů [AI Generated] | ✅ | Automaticky u všech publikovaných materiálů |
| AI jako podpůrný nástroj, ne hodnotitel | ✅ | Hodnocení jsou pouze návrhy/koncepty |
| Právo na výmaz dat žáka | ✅ | `DELETE /erase/students/{id}` |
| Automatická retence a mazání | ✅ | Nočně běžící úloha |
| Export dat (přenositelnost) | ✅ | `GET /export/my-data` |
| Audit log přístupu k datům | ✅ | `audit_log` tabulka |
| Transparentnost — oznámení v aplikaci | ✅ | Sekce v Nastavení |
| Ochrana přihlášení (OAuth, MFA) | ✅ | Google OAuth; MFA závisí na nastavení školy |
| Citlivé údaje (SEN) mimo AI zpracování | ⚠️ | Instrukce pro učitele; technické oddělení plánováno |
| Podpis DPA s OpenAI | ❌ | Nutno podepsat před nasazením |
| Šifrování databáze v klidu | ⚠️ | P2 — doporučeno před plným nasazením |
| Postup hlášení incidentů | ⚠️ | Definuje škola ve své GDPR směrnici |
| MFA vynuceno pro pedagogy | ⚠️ | Závisí na Google Workspace nastavení školy |

---

## Závěr — kroky před spuštěním

Následující kroky jsou nezbytné před formálním nasazením aplikace ve škole:

1. **Podepsat DPA s OpenAI** — openai.com/policies/data-processing-addendum
2. **Podepsat DPA s Railway** — zajistit EU datový region
3. **DPO školy** — přezkoumat a schválit tento dokument a DPIA
4. **Informovat zákonné zástupce** — použít šablonu z `legal/parent-notice-cs.md`
5. **Podepsat smlouvu o zpracování dat se školou** — šablona v `legal/school-dpa-cs.md`
6. **Instruovat pedagogy** — nevkládat citlivé/SEN údaje do pole poznámek
7. **Ověřit MFA** — potvrdit vynucení MFA pro Google účty pedagogů v Google Workspace Admin

---

*Dokument by měl být přezkoumán DPO školy před nasazením a aktualizován při každé změně funkcionality aplikace nebo platných předpisů.*
