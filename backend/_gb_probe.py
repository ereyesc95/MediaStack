import httpx
from app.database import SessionLocal
from app.crud import get_google_books_key

db = SessionLocal()
key = get_google_books_key(db)
db.close()


def try_q(label, params):
    p = dict(params)
    if key:
        p["key"] = key
    r = httpx.get(
        "https://www.googleapis.com/books/v1/volumes", params=p, timeout=30.0
    )
    if r.status_code >= 400:
        print(label, r.status_code, r.text[:180].replace("\n", " "))
    else:
        n = len((r.json() or {}).get("items") or [])
        print(label, r.status_code, f"items={n}")


try_q("simple", {"q": "Historia Natural", "maxResults": 5})
try_q("intitle", {"q": "intitle:Historia Natural", "maxResults": 5})
try_q("quotes", {"q": '"Historia Natural"', "maxResults": 5})
try_q("harry", {"q": "Harry Potter", "maxResults": 3, "printType": "books"})
try_q("no_print", {"q": "Historia Natural", "maxResults": 5})
try_q("lang_es", {"q": "Historia Natural", "maxResults": 5, "langRestrict": "es"})
try_q("ascii", {"q": "Natural History", "maxResults": 5, "printType": "books"})
