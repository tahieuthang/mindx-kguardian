#!/usr/bin/env python3
import os
import re
import json
import urllib.request
import urllib.error

# Get current script directory
script_dir = os.path.dirname(os.path.abspath(__file__))

# ─── Load Environment Variables ───────────────────────────────────────────────
def load_env():
    env_path = os.path.join(script_dir, "..", ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    if "=" in line:
                        key, val = line.split("=", 1)
                        key = key.strip()
                        val = val.strip()
                        if not os.environ.get(key):
                            os.environ[key] = val

load_env()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or ""
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY") or ""
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY") or ""

if not SUPABASE_URL:
    print("\n❌ Error: SUPABASE_URL or VITE_SUPABASE_URL is not set.\n")
    exit(1)

if not GEMINI_API_KEY:
    print("\n❌ Error: GEMINI_API_KEY or VITE_GEMINI_API_KEY is not set.\n")
    exit(1)

md_path = os.path.join(script_dir, "..", "..", "knowledge-ticket.md")
md_path = os.path.abspath(md_path)

if not os.path.exists(md_path):
    print(f"\n❌ Error: knowledge-ticket.md not found at {md_path}\n")
    exit(1)

# ─── Gemini API Call ──────────────────────────────────────────────────────────
def generate_embedding(text, api_key):
    sanitized = re.sub(r'\s+', ' ', text.strip())
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key={api_key}"
    
    payload = {
        "model": "models/gemini-embedding-2",
        "content": {"parts": [{"text": sanitized}]},
        "outputDimensionality": 768
    }
    
    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as res:
            res_data = json.loads(res.read().decode("utf-8"))
            values = res_data.get("embedding", {}).get("values")
            if not values or len(values) != 768:
                raise Exception(f"Unexpected embedding dimension: {len(values) if values else 0}")
            return values
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        raise Exception(f"Gemini API Error: {e.code} - {err_msg}")

# ─── Supabase REST Client ─────────────────────────────────────────────────────
def insert_row(table, key, payload):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    req_data = json.dumps(payload).encode("utf-8")
    
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as res:
            pass
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        raise urllib.error.HTTPError(e.url, e.code, err_msg, e.hdrs, e.fp)

# ─── Markdown Parser ──────────────────────────────────────────────────────────
def parse_tickets(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    parts = re.split(r'(?:^|\n)---\r?\n', content)
    tickets = []
    
    # parts[0] is empty because the file starts with '---'
    for i in range(1, len(parts) - 1, 2):
        frontmatter_raw = parts[i]
        content_raw = parts[i+1]
        
        if not frontmatter_raw or not content_raw:
            continue
            
        title_match = re.search(r'title:\s*(.*)', frontmatter_raw)
        reporter_match = re.search(r'reporter:\s*(.*)', frontmatter_raw)
        
        title = title_match.group(1).strip() if title_match else ""
        reporter = reporter_match.group(1).strip() if reporter_match else "Tathang"
        
        clean_content = content_raw.strip()
        if clean_content.startswith("## Nội dung"):
            clean_content = clean_content[len("## Nội dung"):].strip()
            
        if title and clean_content:
            tickets.append({
                "title": title,
                "reporter": reporter,
                "content": clean_content
            })
            
    return tickets

# ─── Main Execution ───────────────────────────────────────────────────────────
def main():
    print("\n🚀 Starting K-Guardian Knowledge Seeding (Python)...")
    print(f"📂 Parsing tickets from: {md_path}")
    
    tickets = parse_tickets(md_path)
    print(f"📋 Found {len(tickets)} ticket cases to import.")

    if not tickets:
        print("✨ No valid tickets parsed. Exiting.")
        return

    active_key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
    if not active_key:
        print("❌ Error: Neither SUPABASE_SERVICE_KEY nor VITE_SUPABASE_ANON_KEY is available.")
        exit(1)

    current_table = "knowledge_base"
    
    print(f"🌐 Supabase Target: {SUPABASE_URL}")
    print(f"📦 Target Table: {current_table}")
    print("────────────────────────────────────────────────────────────")

    success_count = 0

    for idx, ticket in enumerate(tickets):
        progress = f"[{idx + 1}/{len(tickets)}]"
        print(f"\n{progress} Processing: \"{ticket['title']}\"")
        
        try:
            # 1. Generate Embedding
            print("   🧠 Generating embedding via Gemini... ", end="", flush=True)
            combined_text = f"{ticket['title']} {ticket['content']}"
            embedding = generate_embedding(combined_text, GEMINI_API_KEY)
            print("Done.")
            
            payload = {
                "title": ticket["title"],
                "content": ticket["content"],
                "reporter": ticket["reporter"],
                "embedding": embedding
            }

            # 2. Upload to Supabase
            print(f"   📤 Uploading to table \"{current_table}\"... ", end="", flush=True)
            insert_row(current_table, active_key, payload)
            print("Uploaded successfully!")
            success_count += 1

        except Exception as err:
            print("Failed!")
            print(f"   ❌ Error processing ticket \"{ticket['title']}\": {err}")

    print("\n────────────────────────────────────────────────────────────")
    print("✨ Seeding process complete.")
    print(f"✅ Promoted directly to Prod (knowledge_base): {success_count}")
    print(f"❌ Failed: {len(tickets) - success_count}\n")

if __name__ == "__main__":
    main()
