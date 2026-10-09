import sqlite3, json
con = sqlite3.connect(r"apps\backend\prisma\dev.db")
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("tablas:", [r[0] for r in cur.fetchall()])
try:
    cur.execute("SELECT id, type, config FROM Widget")
    for wid, wtype, cfg in cur.fetchall():
        if wtype == 'pomodoro':
            c = json.loads(cfg)
            print(f"--- pomodoro {wid}")
            print("   linkedTaskId  =", repr(c.get('linkedTaskId')))
            print("   linkedTaskName=", repr(c.get('linkedTaskName')))
            print("   state         =", repr(c.get('state')))
            print("   collapsed     =", repr(c.get('collapsed')))
except Exception as e:
    print("error:", e)
