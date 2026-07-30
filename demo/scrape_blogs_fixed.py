import requests
from bs4 import BeautifulSoup
import json
import re
from datetime import datetime

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')

def scrape_blog():
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
    
    links = set()
    
    # User mentioned 4 pages
    for page_num in range(1, 5):
        url = 'https://override.com.tr/blog/' if page_num == 1 else f'https://override.com.tr/blog/page/{page_num}/'
        print(f"Fetching {url}...")
        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                for a in soup.find_all('a', href=True):
                    href = a['href']
                    if href.startswith('https://override.com.tr/') and len(href) > len('https://override.com.tr/blog/') + 2:
                        if '/category/' not in href and '/tag/' not in href and '/page/' not in href and '/author/' not in href:
                            links.add(href)
        except Exception as e:
            print(f"Failed to fetch {url}: {e}")

    # Remove known non-blog links just in case
    links = {l for l in links if not l.rstrip('/').endswith(('contact', 'solutions', 'iletisim', 'hakkimizda', 'demo', 'login', 'register'))}
                
    print(f"Found {len(links)} unique post links.")
    
    records = []
    
    for link in links:
        print(f"Scraping {link}...")
        try:
            res = requests.get(link, headers=headers)
            if res.status_code != 200:
                continue
            
            post_soup = BeautifulSoup(res.text, 'html.parser')
            
            h1 = post_soup.find('h1')
            title = h1.text.strip() if h1 else 'Bilinmeyen Başlık'
            
            og_image = post_soup.find('meta', property='og:image')
            image_url = og_image['content'] if og_image else ''
            
            article = post_soup.find('article')
            if article:
                entry = article.find('div', class_=lambda c: c and 'entry-content' in c.lower())
                if entry:
                    content_html = str(entry)
                else:
                    content_html = str(article)
            else:
                content_html = ''
                
            og_desc = post_soup.find('meta', property='og:description')
            excerpt = og_desc['content'] if og_desc else ''
            
            # Generate slug from URL or title
            slug_match = link.rstrip('/').split('/')[-1]
            slug = slug_match if slug_match else slugify(title)
            
            now_str = datetime.utcnow().isoformat() + "Z"
            
            records.append({
                "entity_slug": "override_blog",
                "hashtags": ["override"],
                "created_at": now_str,
                "updated_at": now_str,
                "data": {
                    "title": title,
                    "slug": slug,
                    "category": "Genel",
                    "image_url": image_url,
                    "excerpt": excerpt,
                    "content": content_html,
                    "status": "published"
                }
            })
            
        except Exception as e:
            print(f"Error scraping {link}: {e}")
            
    export_data = {
        "app_name": "Blog Data Import",
        "hashtags": "[\"override\"]",
        "export_date": datetime.utcnow().isoformat() + "Z",
        "components": {
            "records": records
        }
    }
    
    with open('blog_import.json', 'w', encoding='utf-8') as f:
        json.dump(export_data, f, indent=2, ensure_ascii=False)
        
    print(f"Created blog_import.json with {len(records)} records")

scrape_blog()
