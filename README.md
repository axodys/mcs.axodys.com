# Microcosm — Static Microblog for GitHub Pages

A clean, minimal personal microblog. No build tools, no dependencies, no hosting costs.

## Files

```
├── index.html          # Public feed
├── admin.html          # Password-protected post editor
├── posts.json          # Your posts (commit this to publish)
├── config.json         # Site title, tagline, author
├── feed.xml            # RSS feed (auto-generated on deploy)
├── generate-feed.js    # RSS generator (run by GitHub Actions)
└── .github/workflows/
    └── deploy.yml      # Auto-deploy on push to main
```

## Setup

### 1. Create a GitHub repository

Push all these files to a new GitHub repo.

### 2. Enable GitHub Pages

- Go to **Settings → Pages**
- Set **Source** to **GitHub Actions**
- Save

Your site will be live at `https://yourusername.github.io/yourrepo`

### 3. Update config.json

Edit `config.json` with your site title, tagline, and name:

```json
{
  "title": "My Journal",
  "tagline": "thoughts, unfiltered",
  "author": "Your Name",
  "siteUrl": "https://yourusername.github.io/yourrepo"
}
```

Commit and push — the site deploys automatically.

## Publishing Posts

### Workflow

1. Open `admin.html` in your browser (open the file locally or visit `yoursite.com/admin.html`)
2. Enter your password (default: `journal123` — **change this first!**)
3. Write your post, optionally add tags and an image
4. Click **publish** — the post is saved in your browser's localStorage
5. Go to **Settings → Export** and download `posts.json`
6. Commit `posts.json` to your GitHub repo
7. GitHub Actions auto-deploys within ~30 seconds

### Changing your password

In the admin panel, go to **Settings → Change Password**.

> Note: The password is stored in your browser's localStorage. It protects the admin UI but is not server-side authentication. Don't rely on it for sensitive content — this is a personal tool.

## Images

Images are embedded as base64 data URIs inside `posts.json`. This means:
- No separate image hosting needed
- Large images will increase your `posts.json` file size
- Recommended: resize images to ~800px wide before uploading

## RSS

An RSS feed is auto-generated at `feed.xml` on every deploy. Readers can subscribe at:
`https://yourusername.github.io/yourrepo/feed.xml`

## Customization

Edit the CSS variables at the top of `index.html` to change colors and fonts:

```css
:root {
  --bg: #faf9f7;
  --accent: #2d6a4f;   /* change to your preferred accent color */
  --serif: 'Lora', Georgia, serif;
}
```
