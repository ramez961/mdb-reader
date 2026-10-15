# Vehicle form mapping and query behavior

The main Arabic RTL record form and the **بحث عام** popup follow the supplied screenshots. Screenshots and their private values are not included in this repository. The popup closes after a valid submission; matches are displayed one at a time in the main form. There is no separate results table.

| Visible label | Raw CARMDI field |
| --- | --- |
| الرقم | ActualNB |
| الرمز | CodeDesc |
| الماركة | MarqueDesc |
| الطراز | TypeDesc |
| وجهة الاستعمال | UtilisDesc |
| سنة الصنع | PRODDATE |
| سنة التسجيل | PreMiseCirc |
| رقم الهيكل | Chassis |
| رقم المحرك | Moteur |
| اللون | CouleurDesc |
| تاريخ الملكية | dateaquisition |
| الاسم | Prenom |
| الشهرة | Nom |
| اسم الأم | NomMere |
| تاريخ الولادة | AgeProp, unchanged raw text |
| السجل والمحلة | NoRegProp / BirthPlace, displayed as two raw values |
| أرقام الهاتف | TelProp |
| العنوان | Addresse |
| أنقاض | HorsService: a present finite nonzero number checks the read-only box |

Read-only schema inspection established that `ActualNB` and `HorsService` are numeric, while year/date-like fields are text. Aggregate shape checks over six separated pages found date-shaped nonempty `AgeProp` values, not numeric ages. This supports displaying that raw field under the screenshot's birth-date label; the original Access control binding and semantic definition still need confirmation. No birth date is calculated, reparsed or inferred from an age. Registration year and ownership date are also displayed unchanged. The combined registry/locality display and nonzero status mapping follow the known fields and screenshot; the Access control definitions were not available for an exact binding comparison.

## General search

All nonempty criteria are combined using **AND**. Blank criteria are omitted, and an entirely blank form browses from the start.

- Plate: numeric equality, with Arabic/Persian digits accepted. Leading zeros do not change the numeric value. Decimals, signs and invalid input are rejected.
- Code, usage, make, model and color: equality after trimming, NFC normalization and case folding. A code `*` is a literal code, not a wildcard.
- Manufacture-year range: inclusive bounds on `PRODDATE`. Either bound may be left empty. Invalid/reversed bounds are rejected in the still-open popup. Missing, nonnumeric and date-shaped manufacture values do not match a year range. Short numeric years are not silently repaired into a different century.
- Name search: independently fill الاسم / الشهرة / اسم الأم; the supplied text must occur inside each populated field. Chassis/engine actions use literal contains matching. Their hidden general-search fields are not applied.

Literal contains is case-insensitive and accepts normalized digit forms. Access wildcards, Arabic letter substitutions, accent-insensitive matching and unknown original VBA/query rules are not emulated. The exact original name/chassis/engine popup behavior was not supplied; these matching rules are visible in their dialogs and are the remaining semantic comparison to make with Access.

## Suggestions and navigation

Suggestions read `CODE.CODEDESC`, `UTILISATION.UTILISDESC`, `MARQUE.MARQUEDESC` and `COULEUR.COULEURDESC`. `MARQUE.MARQUEID` filters `TYPE.MARQUEID` for model suggestions. They are convenience lists, not a required migration or modification. Model suggestions are capped at 250, and other lists are capped above the known lookup-table sizes. Missing or incomplete suggestions still allow a complete typed value. Changing make clears the old model value. Suggestions are serialized with search work so the reader/cache does not execute competing jobs.

A search step checks at most 128 data pages, retains at most 50 matches and uses the existing time/read/cache caps. First/previous/next/last navigate only that retained batch; next-pages replaces it. The main screen explicitly distinguishes partial from complete coverage. Stop terminates the worker and clears its memory; reopening the source is required. Change/Forget clear the record form and query/session state. Real iPhone, iOS Files and newer-MDB compatibility remain unverified.

Desktop browser QA also used an isolated, unshipped worker-message delay harness: after Stop, a deliberately late synthetic result did not repopulate the form or restore continuation. Source identity guards reject callbacks from replaced/terminated workers. Forget cleared the visible record and every search criterion. Unsupported-file recovery was exercised through Change database.
