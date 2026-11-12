// Report categories (the ones iOS uses in the activity report) and the
// built-in domain classification. Users can re-assign any site from its
// detail page; those overrides live in settings.siteCategories.

export const REPORT_CATEGORIES = [
  { id: 'social', name: 'Social', icon: 'social' },
  { id: 'games', name: 'Games', icon: 'games' },
  { id: 'entertainment', name: 'Entertainment', icon: 'entertainment' },
  { id: 'creativity', name: 'Creativity', icon: 'creativity' },
  { id: 'productivity', name: 'Productivity & Finance', icon: 'productivity' },
  { id: 'education', name: 'Education', icon: 'education' },
  { id: 'reading', name: 'Information & Reading', icon: 'reading' },
  { id: 'health', name: 'Health & Fitness', icon: 'health' },
  { id: 'utilities', name: 'Utilities', icon: 'utilities' },
  { id: 'shopping', name: 'Shopping & Food', icon: 'shopping' },
  { id: 'travel', name: 'Travel', icon: 'travel' },
  { id: 'other', name: 'Other', icon: 'others' },
];

export const REPORT_CATEGORY_BY_ID = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c.id, c]));

const DOMAINS = {
  social: [
    'facebook.com', 'fb.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'reddit.com', 'redd.it',
    'linkedin.com', 'snapchat.com', 'pinterest.com', 'tumblr.com', 'threads.net', 'threads.com', 'bsky.app',
    'mastodon.social', 'discord.com', 'discord.gg', 'vk.com', 'weibo.com', 'quora.com', '9gag.com',
    'messenger.com', 'whatsapp.com', 'web.whatsapp.com', 'telegram.org', 'web.telegram.org', 'signal.org',
    'tinder.com', 'bumble.com', 'hinge.co', 'nextdoor.com', 'lemon8-app.com', 'kwai.com', 'truthsocial.com',
    'slack.com', 'teams.microsoft.com', 'meet.google.com', 'zoom.us', 'skype.com', 'line.me', 'wechat.com',
  ],
  entertainment: [
    'youtube.com', 'youtu.be', 'netflix.com', 'twitch.tv', 'primevideo.com', 'disneyplus.com', 'hulu.com',
    'max.com', 'hbomax.com', 'spotify.com', 'open.spotify.com', 'soundcloud.com', 'vimeo.com', 'crunchyroll.com',
    'tv.apple.com', 'music.apple.com', 'kick.com', 'dailymotion.com', 'globoplay.globo.com', 'paramountplus.com',
    'peacocktv.com', 'deezer.com', 'tidal.com', 'music.youtube.com', 'imdb.com', 'letterboxd.com',
    'rottentomatoes.com', 'pluto.tv', 'tubitv.com', 'bandcamp.com', 'last.fm', 'genius.com', 'mubi.com',
  ],
  games: [
    'store.steampowered.com', 'steamcommunity.com', 'chess.com', 'lichess.org', 'roblox.com', 'epicgames.com',
    'itch.io', 'poki.com', 'miniclip.com', 'crazygames.com', 'kongregate.com', 'armorgames.com', 'newgrounds.com',
    'ea.com', 'blizzard.com', 'battle.net', 'xbox.com', 'playstation.com', 'nintendo.com', 'gog.com',
    'minecraft.net', 'leagueoflegends.com', 'riotgames.com', 'ign.com', 'gamespot.com', 'polygon.com',
    'nytimes.com/games', 'geoguessr.com', 'agar.io', 'slither.io', 'krunker.io', 'friv.com', 'coolmathgames.com',
  ],
  shopping: [
    'amazon.com', 'amazon.com.br', 'amazon.co.uk', 'amazon.de', 'ebay.com', 'aliexpress.com', 'etsy.com',
    'mercadolivre.com.br', 'mercadolibre.com', 'shopee.com.br', 'shopee.com', 'temu.com', 'shein.com',
    'ifood.com.br', 'ubereats.com', 'doordash.com', 'walmart.com', 'target.com', 'bestbuy.com', 'ikea.com',
    'magazineluiza.com.br', 'americanas.com.br', 'casasbahia.com.br', 'kabum.com.br', 'zara.com', 'nike.com',
    'instacart.com', 'grubhub.com', 'rappi.com', 'olx.com.br', 'wish.com', 'costco.com', 'asos.com',
  ],
  reading: [
    'news.ycombinator.com', 'nytimes.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'theguardian.com', 'medium.com',
    'substack.com', 'wikipedia.org', 'wikimedia.org', 'g1.globo.com', 'globo.com', 'uol.com.br', 'folha.uol.com.br',
    'estadao.com.br', 'washingtonpost.com', 'reuters.com', 'apnews.com', 'theverge.com', 'techcrunch.com',
    'wired.com', 'arstechnica.com', 'bloomberg.com', 'ft.com', 'economist.com', 'news.google.com', 'feedly.com',
    'goodreads.com', 'archive.org', 'macrumors.com', '9to5mac.com', 'engadget.com', 'wsj.com', 'forbes.com',
    'cnbc.com', 'axios.com', 'politico.com', 'npr.org', 'aljazeera.com', 'lemonde.fr', 'elpais.com', 'tecmundo.com.br',
  ],
  productivity: [
    'github.com', 'gitlab.com', 'bitbucket.org', 'docs.google.com', 'drive.google.com', 'sheets.google.com',
    'calendar.google.com', 'notion.so', 'notion.com', 'trello.com', 'asana.com', 'atlassian.net', 'jira.com',
    'linear.app', 'airtable.com', 'office.com', 'microsoft365.com', 'outlook.com', 'outlook.live.com',
    'onedrive.live.com', 'dropbox.com', 'box.com', 'chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com',
    'perplexity.ai', 'copilot.microsoft.com', 'stackoverflow.com', 'stackexchange.com', 'vercel.com', 'netlify.com',
    'paypal.com', 'nubank.com.br', 'itau.com.br', 'bradesco.com.br', 'santander.com.br', 'bb.com.br', 'caixa.gov.br',
    'stripe.com', 'wise.com', 'revolut.com', 'coinbase.com', 'binance.com', 'tradingview.com', 'investing.com',
    'mail.google.com', 'gmail.com', 'proton.me', 'tuta.com', 'tuta.io', 'fastmail.com', 'icloud.com',
    'monday.com', 'clickup.com', 'todoist.com', 'evernote.com', 'obsidian.md', 'npmjs.com', 'developer.mozilla.org',
  ],
  education: [
    'khanacademy.org', 'coursera.org', 'udemy.com', 'edx.org', 'duolingo.com', 'quizlet.com', 'brilliant.org',
    'codecademy.com', 'freecodecamp.org', 'w3schools.com', 'classroom.google.com', 'scholar.google.com',
    'wolframalpha.com', 'chegg.com', 'mit.edu', 'harvard.edu', 'stanford.edu', 'udacity.com', 'skillshare.com',
    'masterclass.com', 'ted.com', 'leetcode.com', 'exercism.org', 'alura.com.br', 'brainly.com', 'babbel.com',
  ],
  creativity: [
    'figma.com', 'canva.com', 'behance.net', 'dribbble.com', 'adobe.com', 'photopea.com', 'unsplash.com',
    'pexels.com', 'deviantart.com', 'artstation.com', 'codepen.io', 'midjourney.com', 'framer.com', 'webflow.com',
    'excalidraw.com', 'tldraw.com', 'splice.com', 'pixlr.com', 'flickr.com', '500px.com', 'coolors.co',
  ],
  health: [
    'myfitnesspal.com', 'strava.com', 'fitbit.com', 'headspace.com', 'calm.com', 'webmd.com', 'mayoclinic.org',
    'healthline.com', 'nike.com/ntc-app', 'garmin.com', 'peloton.com', 'cronometer.com', 'sleepfoundation.org',
  ],
  travel: [
    'booking.com', 'airbnb.com', 'expedia.com', 'tripadvisor.com', 'kayak.com', 'skyscanner.net', 'skyscanner.com',
    'google.com/travel', 'maps.google.com', 'uber.com', '99app.com', 'latamairlines.com', 'voegol.com.br',
    'voeazul.com.br', 'decolar.com', 'hotels.com', 'trivago.com', 'lyft.com', 'waze.com', 'openstreetmap.org',
  ],
  utilities: [
    'google.com', 'bing.com', 'duckduckgo.com', 'search.brave.com', 'startpage.com', 'kagi.com', 'ecosia.org',
    'translate.google.com', 'deepl.com', 'speedtest.net', 'fast.com', 'weather.com', 'accuweather.com',
    'timeanddate.com', 'icloud.com', 'apple.com', 'mozilla.org', 'addons.mozilla.org', 'support.mozilla.org',
    'microsoft.com', 'bitwarden.com', '1password.com', 'lastpass.com', 'wetransfer.com', 'archlinux.org',
    'wiki.archlinux.org', 'localhost', 'web.archive.org', 'virustotal.com', 'whatismyipaddress.com',
  ],
};

// Exact/suffix lookup table (host-level only; entries with paths are ignored here).
const LOOKUP = new Map();
for (const [cat, list] of Object.entries(DOMAINS)) {
  for (const d of list) if (!d.includes('/') && !LOOKUP.has(d)) LOOKUP.set(d, cat);
}

/** Domains that belong to a report category by default. */
export function defaultDomainsFor(categoryId) {
  return (DOMAINS[categoryId] || []).filter((d) => !d.includes('/'));
}

// Keyword fallbacks for unknown hosts. Kept conservative on purpose.
const HEURISTICS = [
  [/\.(edu|edu\.[a-z]{2}|ac\.[a-z]{2})$|school|university|academy|courses?\b|learn/, 'education'],
  [/news|herald|journal|gazette|tribune|magazine|blog|wiki/, 'reading'],
  [/shop|store|market|deals|food|delivery|pizza|burger/, 'shopping'],
  [/games?\b|gaming|casino|poker/, 'games'],
  [/bank|finance|invest|crypto|wallet|^docs\.|^mail\.|calendar/, 'productivity'],
  [/movie|films?\b|music|stream|anime|radio|podcast/, 'entertainment'],
  [/travel|hotel|flights?\b|trip/, 'travel'],
  [/health|fitness|gym|clinic|yoga/, 'health'],
  [/design|photo|drawing/, 'creativity'],
];

/** Classify a hostname into a report category id. */
export function reportCategoryOf(domain, overrides = {}) {
  if (!domain) return 'other';
  if (overrides[domain]) return overrides[domain];
  let host = domain;
  // Walk up the subdomain chain: m.youtube.com -> youtube.com
  while (host) {
    if (overrides[host]) return overrides[host];
    if (LOOKUP.has(host)) return LOOKUP.get(host);
    const dot = host.indexOf('.');
    if (dot < 0) break;
    host = host.slice(dot + 1);
    if (!host.includes('.')) break; // stop at the TLD
  }
  for (const [re, cat] of HEURISTICS) if (re.test(domain)) return cat;
  return 'other';
}

const NAMES = {
  'youtube.com': 'YouTube', 'music.youtube.com': 'YouTube Music', 'instagram.com': 'Instagram', 'tiktok.com': 'TikTok',
  'x.com': 'X', 'twitter.com': 'Twitter', 'facebook.com': 'Facebook', 'reddit.com': 'Reddit', 'old.reddit.com': 'Reddit',
  'web.whatsapp.com': 'WhatsApp', 'whatsapp.com': 'WhatsApp', 'web.telegram.org': 'Telegram', 'netflix.com': 'Netflix',
  'twitch.tv': 'Twitch', 'github.com': 'GitHub', 'gitlab.com': 'GitLab', 'google.com': 'Google', 'mail.google.com': 'Gmail',
  'docs.google.com': 'Google Docs', 'drive.google.com': 'Google Drive', 'calendar.google.com': 'Google Calendar',
  'meet.google.com': 'Google Meet', 'maps.google.com': 'Google Maps', 'translate.google.com': 'Google Translate',
  'gemini.google.com': 'Gemini', 'linkedin.com': 'LinkedIn', 'discord.com': 'Discord', 'open.spotify.com': 'Spotify',
  'spotify.com': 'Spotify', 'chatgpt.com': 'ChatGPT', 'claude.ai': 'Claude', 'wikipedia.org': 'Wikipedia',
  'en.wikipedia.org': 'Wikipedia', 'pt.wikipedia.org': 'Wikipédia', 'amazon.com': 'Amazon', 'amazon.com.br': 'Amazon',
  'mercadolivre.com.br': 'Mercado Livre', 'news.ycombinator.com': 'Hacker News', 'pinterest.com': 'Pinterest',
  'threads.net': 'Threads', 'threads.com': 'Threads', 'bsky.app': 'Bluesky', 'notion.so': 'Notion', 'figma.com': 'Figma',
  'duckduckgo.com': 'DuckDuckGo', 'chess.com': 'Chess.com', 'lichess.org': 'Lichess', 'primevideo.com': 'Prime Video',
  'disneyplus.com': 'Disney+', 'max.com': 'Max', 'crunchyroll.com': 'Crunchyroll', 'stackoverflow.com': 'Stack Overflow',
  'perplexity.ai': 'Perplexity', 'outlook.live.com': 'Outlook', 'outlook.office.com': 'Outlook', 'medium.com': 'Medium',
  'substack.com': 'Substack', 'duolingo.com': 'Duolingo', 'snapchat.com': 'Snapchat', 'tumblr.com': 'Tumblr',
  'ifood.com.br': 'iFood', 'shopee.com.br': 'Shopee', 'aliexpress.com': 'AliExpress', 'ebay.com': 'eBay',
  'globoplay.globo.com': 'Globoplay', 'g1.globo.com': 'g1', 'kick.com': 'Kick', 'vimeo.com': 'Vimeo',
  'soundcloud.com': 'SoundCloud', 'quora.com': 'Quora', 'messenger.com': 'Messenger', 'roblox.com': 'Roblox',
  'store.steampowered.com': 'Steam', 'steamcommunity.com': 'Steam Community', 'canva.com': 'Canva', 'bing.com': 'Bing',
};

/** Friendly display name for a hostname (falls back to the hostname). */
export function prettyName(domain) {
  return NAMES[domain] || domain;
}
