import requests
from bs4 import BeautifulSoup
import json
import uuid

def scrape_blog():
    print("Fetching blog list...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
    list_url = 'https://override.com.tr/blog/'
    response = requests.get(list_url, headers=headers)
    if response.status_code != 200:
        print(f"Failed to fetch {list_url}: {response.status_code}")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Need to find the blog post links. Usually they are in article tags or div with post class.
    # We will search for all links that have /blog/ in them and are longer than just /blog/
    links = set()
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('https://override.com.tr/') and len(href) > len('https://override.com.tr/blog/') + 2:
            # check if it looks like a single post link (no /page/, no /category/)
            if '/category/' not in href and '/tag/' not in href and '/page/' not in href:
                links.add(href)
                
    print(f"Found {len(links)} unique post links.")
    
    records = []
    record_fields = []
    record_id = 9000  # Start IDs from 9000 to avoid conflicts
    
    for link in links:
        print(f"Scraping {link}...")
        try:
            res = requests.get(link, headers=headers)
            if res.status_code != 200:
                continue
            
            post_soup = BeautifulSoup(res.text, 'html.parser')
            
            # Find Title (usually h1)
            h1 = post_soup.find('h1')
            title = h1.text.strip() if h1 else 'Bilinmeyen Başlık'
            
            # Find Image (usually og:image)
            og_image = post_soup.find('meta', property='og:image')
            image_url = og_image['content'] if og_image else ''
            
            # Find Content
            # Usually in a div with class containing 'content' or 'elementor-widget-theme-post-content'
            content_div = post_soup.find('div', class_=lambda c: c and 'content' in c.lower())
            
            # Since override.com.tr uses Elementor, maybe we can look for 'elementor-widget-theme-post-content'
            el_content = post_soup.find('div', class_='elementor-widget-theme-post-content')
            if el_content:
                content_html = str(el_content)
            elif content_div:
                content_html = str(content_div)
            else:
                # Fallback to main or article
                article = post_soup.find('article')
                content_html = str(article) if article else ''
                
            # Excerpt can be og:description
            og_desc = post_soup.find('meta', property='og:description')
            excerpt = og_desc['content'] if og_desc else ''
            
            # Add to records
            records.append({
                "id": record_id,
                "entity_slug": "override_blog",
                "hashtags": "[\"blog_import\"]"
            })
            
            record_fields.extend([
                {"record_id": record_id, "key": "title", "val_str": title, "val_text": None},
                {"record_id": record_id, "key": "image", "val_str": image_url, "val_text": None},
                {"record_id": record_id, "key": "excerpt", "val_str": None, "val_text": excerpt},
                {"record_id": record_id, "key": "content", "val_str": None, "val_text": content_html},
                {"record_id": record_id, "key": "status", "val_str": "published", "val_text": None},
            ])
            
            record_id += 1
            
        except Exception as e:
            print(f"Error scraping {link}: {e}")
            
    # Build final JSON
    export_data = {
        "app_name": "Blog Data Import",
        "tag": "blog",
        "export_date": "2026-07-29T00:00:00.000Z",
        "components": {
            "records": records,
            "record_fields": record_fields
        }
    }
    
    with open('blog_import.json', 'w', encoding='utf-8') as f:
        json.dump(export_data, f, indent=2, ensure_ascii=False)
        
    print("Created blog_import.json")

scrape_blog()
