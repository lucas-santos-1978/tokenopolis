# Contributing

Thanks for taking a look. Tokenopolis is a small, dependency-free Node + Three.js project, so
contributing is mostly about keeping it that way.

## Ground rules

- **No dependencies, no build step.** The server is plain Node (ES modules, Node 22.15 or newer)
  and the pages are plain ES modules. three.js and the fonts are served by the panel itself, from
  `public/vendor/` (unmodified copies, with their licenses), so the pages call no outside site. If a
  change needs a package, open an issue first.
- **Everything the user reads goes through the dictionaries.** The server sends ids, numbers and
  dates; the browser formats them (`docs/contract.md`, `docs/i18n.md`). A new string gets a key
  in `public/i18n/en/*.js` and `public/i18n/pt-BR/*.js`; never a literal in the page code.
- **No real people in the repository.** Fixtures use `example.com`; screenshots and demo data are
  fictional. Local data files (`team.json`, `nicknames.json`, `belts.json`, `data.json`, `.env`,
  `public/avatars/*`) are ignored by git and must stay that way.
- Code comments and log messages are in English.

## Running it

```bash
npm run mock          # generated data at http://localhost:3000
```
Open `http://localhost:3000/?demo` for the large demo region, `climb.html` for the climb, and add
`?lang=pt-BR` to see the Portuguese version. Copy `.env.example` to `.env` for real data
(`docs/configuration.md`).

## Before opening a pull request

```bash
for f in $(git ls-files '*.js' '*.mjs' '*.cjs'); do node --check "$f"; done
PORT=3999 npm run mock                   # then open both pages in en and pt-BR
```
Check the browser console: there must be no errors and no `[i18n] missing` warnings. The CI
workflow runs the syntax check and a smoke test of the API.

## Adding a data source

Implement the interface in `docs/contract.md` (ten methods, two optional extras) in a module that
exports `createSource(config)`, and point `DATA_SOURCE` at it. `server/sources/file.js` is the
smallest example; `server/sources/mock.js` the most complete one.

## Reporting problems

Open an issue with the page (`city.html` or `climb.html`), the data source (`mock`, `demo`,
`datadog`, `file`), the browser, and the console output. Screenshots of generated or demo data are
welcome; please do not post screenshots that show real people's names or usage.
