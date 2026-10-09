from contextlib import asynccontextmanager
from pathlib import Path
import sqlite3

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "board.sqlite"
SCHEMA = (ROOT / "schema.sql").read_text(encoding="utf-8")


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    with connect() as connection:
        connection.executescript(SCHEMA)


def state_exists(connection, state_id):
    row = connection.execute(
        'SELECT 1 FROM "状態" WHERE "識別子" = ?',
        (state_id,),
    ).fetchone()
    return row is not None


def ordered_ids(connection, state_id):
    rows = connection.execute(
        'SELECT "識別子" FROM "作品" WHERE "状態の識別子" = ? ORDER BY "位置", "識別子"',
        (state_id,),
    ).fetchall()
    return [row["識別子"] for row in rows]


def write_order(connection, state_id, work_ids):
    for offset, work_id in enumerate(work_ids):
        connection.execute(
            'UPDATE "作品" SET "状態の識別子" = ?, "位置" = ? WHERE "識別子" = ?',
            (state_id, -(offset + 1), work_id),
        )
    for position, work_id in enumerate(work_ids, start=1):
        connection.execute(
            'UPDATE "作品" SET "位置" = ? WHERE "識別子" = ?',
            (position, work_id),
        )


class NewWork(BaseModel):
    state_id: int
    name: str


class WorkName(BaseModel):
    name: str


class WorkMove(BaseModel):
    state_id: int
    index: int


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)
templates = Jinja2Templates(directory=ROOT / "templates")


@app.get("/health")
def health():
    with connect() as connection:
        connection.execute("SELECT 1").fetchone()
    return {"status": "ok", "database": "up"}


@app.get("/", response_class=HTMLResponse)
def board(request: Request):
    with connect() as connection:
        board_row = connection.execute(
            'SELECT "ボード名" FROM "選択ボード" WHERE "識別子" = 1'
        ).fetchone()
        states = connection.execute(
            'SELECT "識別子", "状態名" FROM "状態" ORDER BY "位置"'
        ).fetchall()
        works = connection.execute(
            'SELECT "識別子", "状態の識別子", "名前" FROM "作品" ORDER BY "位置", "識別子"'
        ).fetchall()
    columns = []
    for state in states:
        items = [
            {"id": row["識別子"], "name": row["名前"]}
            for row in works
            if row["状態の識別子"] == state["識別子"]
        ]
        columns.append({"id": state["識別子"], "name": state["状態名"], "works": items})
    return templates.TemplateResponse(
        request,
        "board.html",
        {
            "board_name": board_row["ボード名"],
            "states": columns,
        },
    )


@app.post("/works")
def add_work(body: NewWork):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="名前を入力してください。")
    with connect() as connection:
        if not state_exists(connection, body.state_id):
            raise HTTPException(status_code=404, detail="状態が見つかりません。")
        position = connection.execute(
            'SELECT COALESCE(MAX("位置"), 0) + 1 AS next_pos FROM "作品" WHERE "状態の識別子" = ?',
            (body.state_id,),
        ).fetchone()["next_pos"]
        cursor = connection.execute(
            'INSERT INTO "作品" ("状態の識別子", "名前", "位置") VALUES (?, ?, ?)',
            (body.state_id, name, position),
        )
        return {"id": cursor.lastrowid, "name": name}


@app.post("/works/{work_id}")
def rename_work(work_id: int, body: WorkName):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="名前を入力してください。")
    with connect() as connection:
        updated = connection.execute(
            'UPDATE "作品" SET "名前" = ? WHERE "識別子" = ?',
            (name, work_id),
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=404, detail="作品が見つかりません。")
    return {"id": work_id, "name": name}


@app.delete("/works/{work_id}")
def delete_work(work_id: int):
    with connect() as connection:
        current = connection.execute(
            'SELECT "状態の識別子" FROM "作品" WHERE "識別子" = ?',
            (work_id,),
        ).fetchone()
        if current is None:
            raise HTTPException(status_code=404, detail="作品が見つかりません。")
        state_id = current["状態の識別子"]
        connection.execute('DELETE FROM "作品" WHERE "識別子" = ?', (work_id,))
        write_order(connection, state_id, ordered_ids(connection, state_id))
    return {"ok": True}


@app.post("/works/{work_id}/move")
def move_work(work_id: int, body: WorkMove):
    with connect() as connection:
        current = connection.execute(
            'SELECT "状態の識別子" FROM "作品" WHERE "識別子" = ?',
            (work_id,),
        ).fetchone()
        if current is None:
            raise HTTPException(status_code=404, detail="作品が見つかりません。")
        if not state_exists(connection, body.state_id):
            raise HTTPException(status_code=404, detail="状態が見つかりません。")
        source_id = current["状態の識別子"]
        target_ids = [item for item in ordered_ids(connection, body.state_id) if item != work_id]
        index = max(0, min(body.index, len(target_ids)))
        target_ids.insert(index, work_id)
        write_order(connection, body.state_id, target_ids)
        if source_id != body.state_id:
            write_order(
                connection,
                source_id,
                [item for item in ordered_ids(connection, source_id) if item != work_id],
            )
    return {"ok": True}


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
