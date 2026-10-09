import sqlite3, json
con = sqlite3.connect(r"apps\backend\prisma\dev.db")
cur = con.cursor()
cur.execute("SELECT id, config FROM Widget WHERE type='pomodoro'")
for wid, cfg in cur.fetchall():
    c = json.loads(cfg)
    if c.get("technique") == "countup":
        print(f"{wid[:8]}  linked={c.get('linkedTaskName')!r}")
        print(f"          workMinutes={c.get('workMinutes')!r}  remainingSeconds={c.get('remainingSeconds')!r}  elapsedMs={c.get('elapsedMs')!r}  state={c.get('state')!r}")
print("--- tareas con tiempo estimado ---")
cur.execute("SELECT id, config FROM Widget WHERE type='todo-list'")
for wid, cfg in cur.fetchall():
    c = json.loads(cfg)
    for i in (c.get("items") or []):
        if i.get("estimatedTime"):
            print(f"  {i.get('text')!r} -> {i.get('estimatedTime')}{i.get('estimatedTimeUnit')}")
