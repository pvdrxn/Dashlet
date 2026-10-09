import sqlite3, json
con = sqlite3.connect(r"apps\backend\prisma\dev.db")
cur = con.cursor()
cur.execute("SELECT id, type, config FROM Widget")
rows = cur.fetchall()
print("=== pomodoros: title (prueba de que widgetId coincide con el id) ===")
for wid, wtype, cfg in rows:
    if wtype != 'pomodoro': continue
    c = json.loads(cfg)
    print(f"{wid[:8]}  title={c.get('title')!r:14} linked={bool(c.get('linkedTaskId'))} state={c.get('state')!r}")
print()
print("=== todo-lists ===")
for wid, wtype, cfg in rows:
    if wtype != 'todo-list': continue
    c = json.loads(cfg)
    items = c.get('items') or []
    pend = [i['text'] for i in items if not i.get('completed')]
    print(f"{wid[:8]}  pendientes={len(pend)}  activeTaskId={str(c.get('activeTaskId'))[:20]}")
