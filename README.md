# Nova

Personal assistant. Local first. No App Store. No Siri. No API yet.

## Open Nova

Until GitHub Pages finishes the first publish, use:

**[Launch Nova (preview)](https://htmlpreview.github.io/?https://github.com/wolfplayz07/Nova-AI/blob/main/web/index.html)**

After you turn Pages on (one time), the stable site will be:

**https://wolfplayz07.github.io/Nova-AI/**

Safari → that link → Share → Add to Home Screen.

## Auto updates

Every push to `main` that touches `web/` runs `.github/workflows/pages.yml` and republishes the site. Same idea as Cloudflare Pages: git push → live site.

You still need one owner click: repo **Settings → Pages → Source = GitHub Actions**.

Cloudflare Pages is the same pattern (connect this repo, output folder `web`). Not connected from this chat; GitHub Actions is already in the repo.

## Careful on-phone training

Tiny CPU toy. Not ChatGPT. No phone GPU.

```
train
pause
sample
train status
reset brain
```
