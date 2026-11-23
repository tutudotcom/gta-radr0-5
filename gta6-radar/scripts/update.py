#!/usr/bin/env python3
"""GTA VI RADAR: coletor público, sem dependências externas.

Fontes: Google News RSS, Rockstar Newswire (links públicos, melhor esforço), GitHub API.
A coleta é agendada pelo GitHub Actions. Não hospeda conteúdo vazado.
"""
from __future__ import annotations

import hashlib
import html
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FEED = ROOT / 'site' / 'data' / 'feed.json'
NOW = datetime.now(timezone.utc)
UA = 'GTA6Radar/1.0 (+open-source news monitor; GitHub Actions)'
TIMEOUT = 18
MAX_ARTICLES = 320
REPO_NAMES = ['ItsNotRexed/Leonida', 'R0Y00/Xbox2Windows']
KEYWORD = re.compile(r'\b(gta[ -]?(?:6|vi)|grand theft auto[ -]?(?:6|vi))\b', re.IGNORECASE)
LEAK_RE = re.compile(r'\b(leak|leaked|leaks|cyberleek|vazam|vazou|vazamento|rumou?r|boato|hacker|torrent)\w*', re.IGNORECASE)
RECOMP_RE = re.compile(r'\b(recompil|decompil|reverse.engineer|leonida|xbox2windows|emulat|recompile|port não oficial|unofficial port|c[oó]digo.fonte|source code)\w*', re.IGNORECASE)
PC_RE = re.compile(r'\b(pc|windows|steam|computador|port|release date|lançamento|lançamento para pc|versão de pc|vers[aã]o pc)\b', re.IGNORECASE)
FEEDS = [
    ('geral', '"GTA 6" OR "Grand Theft Auto VI" when:14d'),
    ('pc', '"GTA 6" PC OR Windows OR Steam when:14d'),
    ('vazamentos', '"GTA 6" leak OR vazamento OR cyberleek when:21d'),
    ('recompilacao', '"GTA 6" decompilation OR recompilation OR Leonida OR Xbox2Windows when:21d'),
    ('rockstar', 'site:rockstargames.com/newswire "Grand Theft Auto VI" when:30d'),
]
GITHUB_INFO = {
    'ItsNotRexed/Leonida': ('LEONIDA', 'Recompilação estática experimental da versão Xbox de GTA VI para Windows.'),
    'R0Y00/Xbox2Windows': ('XBOX2WINDOWS', 'Pesquisa comunitária sobre recompilação x64 e tradução de shaders para Windows.'),
}
logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')


def request_bytes(url: str, json_api: bool = False) -> bytes:
    headers = {'User-Agent': UA, 'Accept': 'application/vnd.github+json' if json_api else 'application/rss+xml, application/xml, text/html;q=0.8, */*;q=0.3'}
    if json_api and os.getenv('GITHUB_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']
    with urlopen(Request(url, headers=headers), timeout=TIMEOUT) as response:
        return response.read(4 * 1024 * 1024)


def get_json(url: str):
    return json.loads(request_bytes(url, json_api=True).decode('utf-8'))


def plain(value: str, limit: int = 500) -> str:
    value = re.sub(r'<[^>]*>', ' ', str(value or ''))
    value = html.unescape(value)
    value = re.sub(r'\s+', ' ', value).strip()
    return value[:limit].rstrip()


def clean_url(value: str) -> str | None:
    try:
        u = urlparse(value)
        return value if u.scheme == 'https' and u.netloc else None
    except ValueError:
        return None


def utc_iso(value) -> str | None:
    if not value:
        return None
    try:
        if isinstance(value, datetime):
            date = value
        else:
            date = parsedate_to_datetime(str(value)) if ',' in str(value) else datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        return date.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    except (ValueError, TypeError, IndexError):
        return None


def source_name(value: str) -> str:
    return plain(value, 80) or 'Google Notícias'


def classify(title: str, description: str, suggested: str = '') -> tuple[str, str]:
    combined = title + ' ' + description
    # Ordem importante: rumores da versão PC também devem ir para Vazamentos.
    if LEAK_RE.search(title):
        return 'leaks', 'unverified'
    if RECOMP_RE.search(title):
        return 'recomp', 'press'
    if PC_RE.search(title):
        return 'pc', 'press'
    if suggested == 'vazamentos' and LEAK_RE.search(combined):
        return 'leaks', 'unverified'
    if suggested == 'recompilacao' and RECOMP_RE.search(combined):
        return 'recomp', 'press'
    if suggested == 'pc' and PC_RE.search(combined):
        return 'pc', 'press'
    return 'general', 'press'


def stable_id(source: str, title: str) -> str:
    base = re.sub(r'[^\w]+', ' ', (source + ' ' + title).casefold()).strip()
    return 'news-' + hashlib.sha1(base.encode('utf-8')).hexdigest()[:16]


def fetch_google_news(label: str, query: str) -> list[dict]:
    encoded = quote(query, safe='')
    url = f'https://news.google.com/rss/search?q={encoded}&hl=pt-BR&gl=BR&ceid=BR:pt-419'
    raw = request_bytes(url)
    root = ET.fromstring(raw)
    items = []
    for item in root.findall('.//channel/item')[:60]:
        title = plain(item.findtext('title'), 240)
        source_node = item.find('source')
        publisher = source_name(source_node.text if source_node is not None else '')
        # Google News frequentemente acrescenta o publisher após o hífen.
        if publisher != 'Google Notícias' and title.endswith(' - ' + publisher):
            title = title[:-(len(publisher) + 3)].rstrip()
        if not KEYWORD.search(title):
            continue
        link = clean_url((item.findtext('link') or '').strip())
        if not link:
            continue
        description = plain(item.findtext('description'), 300)
        if description.casefold().startswith(title.casefold()[:70]):
            description = ''
        category, verification = classify(title, description, label)
        items.append({
            'id': stable_id(publisher, title), 'title': title,
            'description': description or f'Cobertura de {publisher}. Abra a reportagem para obter os detalhes e verificar as fontes.',
            'url': link, 'source': publisher, 'published': utc_iso(item.findtext('pubDate')),
            'category': category, 'verification': verification, 'origin': 'google-news',
        })
    return items


class NewswireParser(HTMLParser):
    """Extrai apenas links da própria Rockstar; alguns layouts podem não expor títulos."""
    def __init__(self):
        super().__init__()
        self.links = []
        self.collecting = 0
        self.href = ''
        self.parts = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and not self.collecting:
            href = attrs.get('href', '')
            if '/newswire/article/' in href:
                self.collecting = 1
                self.href = href
                self.parts = [attrs.get('aria-label', '')]
    def handle_endtag(self, tag):
        if not self.collecting or tag != 'a':
            return
        title = plain(' '.join(self.parts), 180)
        if title and len(title) > 14:
            self.links.append((title, self.href))
        self.collecting = 0
    def handle_data(self, data):
        if self.collecting:
            self.parts.append(data)


def fetch_rockstar() -> list[dict]:
    url = 'https://www.rockstargames.com/newswire?tag=722'
    parser = NewswireParser()
    parser.feed(request_bytes(url).decode('utf-8', errors='replace'))
    seen = set()
    items = []
    for title, href in parser.links:
        link = clean_url(urljoin(url, href))
        if not link or link in seen:
            continue
        seen.add(link)
        # Nem todo artigo da Rockstar é sobre GTA VI.
        if not KEYWORD.search(title):
            continue
        items.append({
            'id': stable_id('rockstar', link), 'title': title,
            'description': 'Publicação diretamente do boletim oficial da Rockstar Games.',
            'url': link, 'source': 'Rockstar Games', 'published': None,
            'category': 'official', 'verification': 'official', 'origin': 'rockstar',
        })
        if len(items) >= 25:
            break
    return items


def fetch_repository(full_name: str) -> tuple[dict, list[dict]]:
    meta = get_json(f'https://api.github.com/repos/{full_name}')
    commits = get_json(f'https://api.github.com/repos/{full_name}/commits?per_page=5')
    display_name, desc = GITHUB_INFO[full_name]
    records = []
    for entry in commits[:5]:
        details = entry.get('commit') or {}
        message = plain((details.get('message') or '').split('\n')[0], 170)
        published = utc_iso((details.get('committer') or {}).get('date') or (details.get('author') or {}).get('date'))
        link = clean_url(entry.get('html_url',''))
        sha = str(entry.get('sha', ''))[:12]
        if not link or not message or not sha:
            continue
        records.append({
            'id': f'commit-{full_name.lower().replace("/","-")}-{sha}',
            'title': f'{display_name}: {message}',
            'description': 'Commit publicado no GitHub. Não indica, isoladamente, que GTA VI já inicia ou funciona no PC.',
            'url': link, 'source': f'GitHub / {full_name.split("/")[0]}',
            'published': published, 'category': 'recomp',
            'verification': 'repository', 'origin': 'github',
        })
    repo = {
        'full_name': full_name, 'name': display_name, 'description': desc,
        'html_url': clean_url(meta.get('html_url','')) or f'https://github.com/{full_name}',
        'stargazers_count': meta.get('stargazers_count'),
        'forks_count': meta.get('forks_count'), 'open_issues_count': meta.get('open_issues_count'),
        'pushed_at': utc_iso(meta.get('pushed_at')),
        'last_commit': {
            'message': plain((commits[0].get('commit') or {}).get('message','').split('\n')[0], 140),
            'url': commits[0].get('html_url'),
        } if commits else None,
    }
    return repo, records


def merge_items(old: list[dict], new: list[dict]) -> list[dict]:
    by_id = {}
    # Manter matérias históricas, mas substituir informações da fonte se disponíveis.
    for item in old + new:
        if not isinstance(item, dict) or not item.get('id') or not item.get('title') or not clean_url(item.get('url','')):
            continue
        by_id[str(item['id'])] = item
    def sort_key(item):
        value = utc_iso(item.get('published'))
        return value or ''
    return sorted(by_id.values(), key=sort_key, reverse=True)[:MAX_ARTICLES]


def main():
    previous = json.loads(FEED.read_text(encoding='utf-8'))
    new_articles = []
    repo_map = {r['full_name']: r for r in previous.get('repositories', [])}
    health = {}
    ok_count = 0
    for name, query in FEEDS:
        try:
            articles = fetch_google_news(name, query)
            new_articles.extend(articles)
            health[f'google-{name}'] = {'ok': True, 'items': len(articles)}
            ok_count += 1
            logging.info('%s: %d artigos', name, len(articles))
        except (OSError, HTTPError, URLError, ET.ParseError, ValueError) as exc:
            health[f'google-{name}'] = {'ok': False, 'message': type(exc).__name__}
            logging.warning('Falha %s: %s',name,exc)
    try:
        official_items = fetch_rockstar()
        new_articles.extend(official_items)
        health['rockstar'] = {'ok': True, 'items': len(official_items)}
        ok_count += 1
        logging.info('Rockstar: %d links', len(official_items))
    except (OSError, HTTPError, URLError, ValueError) as exc:
        health['rockstar'] = {'ok': False, 'message': type(exc).__name__}
        logging.warning('Rockstar indisponível: %s', exc)
    for full_name in REPO_NAMES:
        try:
            repo, commits = fetch_repository(full_name)
            repo_map[full_name] = repo
            new_articles.extend(commits)
            health[f'github-{full_name}'] = {'ok': True, 'items': len(commits)}
            ok_count += 1
            logging.info('GitHub %s: %d commits', full_name, len(commits))
        except (OSError, HTTPError, URLError, ValueError, TypeError, IndexError, KeyError) as exc:
            health[f'github-{full_name}'] = {'ok': False, 'message': type(exc).__name__}
            logging.warning('GitHub %s indisponível: %s',full_name,exc)
    if not ok_count:
        logging.error('Nenhuma fonte acessível. Arquivo original mantido para evitar marcar dados antigos como atuais.')
        raise SystemExit(1)
    result = {
        'version': 1, 'mode': 'live',
        'generated_at': NOW.isoformat(timespec='seconds').replace('+00:00','Z'),
        'source_health': health,
        'articles': merge_items(previous.get('articles', []), new_articles),
        'repositories': [repo_map[name] for name in REPO_NAMES if name in repo_map],
    }
    temp = FEED.with_suffix('.json.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(FEED)
    logging.info('Monitor pronto: %d matérias, %d fontes acessíveis.', len(result['articles']), ok_count)

if __name__ == '__main__':
    main()
