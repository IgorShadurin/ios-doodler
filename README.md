# Open iOS Doodler

Open iOS Doodler helps you make App Store screenshots in many languages.

You upload screenshot templates, place text labels once, and then generate final images for iPhone/iPad sizes.

## Who this is for

- App teams that need App Store screenshots in many languages.
- Designers/marketers who want one repeatable workflow.

## What you can do

- Upload 1 or many template images.
- Add text labels and drag them where you want.
- Import translations from JSON.
- Preview any language.
- Generate images for selected iOS sizes.
- Generate for one language or all languages.
- Save output to a folder grouped by language.

## Example output folder

```text
my-output/
  screenshots/
    en-US/
      01-shot.png
      02-shot.png
    de-DE/
      01-shot.png
      02-shot.png
```

## Quick start

1. Install packages:

```bash
npm install
```

2. Prepare database:

```bash
npm run prisma:generate
npm run prisma:push
```

3. Start app:

```bash
npm run dev
```

4. Open in browser:

```text
http://localhost:3000
```

Note: If port 3000 is busy, Next.js will use another port (for example 3001).

## How to use

1. Upload a template image.
2. Add labels and move them to the right positions.
3. Import translations JSON.
4. Select templates, languages, iOS sizes.
5. Set output directory.
6. Run generation.

## Translation JSON format

```json
{
  "en": {
    "title": "Plan your day in seconds",
    "subtitle": "Smart reminders and calm focus mode"
  },
  "es": {
    "title": "Planifica tu dia en segundos",
    "subtitle": "Recordatorios inteligentes y modo enfoque"
  }
}
```

Rules:

- Top-level keys = language codes (`en`, `es`, `de`, etc).
- Inside each language, key names must match your label keys.
- All values must be strings.

## Screen size support

- Full editor is for desktop and iPad.
- On small phone screens, the app shows a warning card.

## Helpful commands

```bash
npm run lint
npm test
npm run build
```

## Tech stack

- Next.js + TypeScript
- shadcn/ui
- Prisma + SQLite
- Sharp (image generation)
