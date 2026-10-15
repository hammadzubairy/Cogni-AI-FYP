"""Operational CLI: create-admin, migrate, purge-demo."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

from app.core.config import settings
from app.core.db import client as db_client
from app.core.db import create_indexes
from app.core.security import hash_password, verify_password
from app.services.passwords import validate_password
from pymongo import AsyncMongoClient

# Known legacy demo emails from the retired seed world.
LEGACY_DEMO_EMAILS = frozenset(
    {
        "admin@cogni.pk",
        "imran.butt@cogni.pk",
        "it.support@cogni.pk",
        "tariq.mehmood@umt.edu.pk",
        "samina.javed@umt.edu.pk",
        "kamran.yousaf@umt.edu.pk",
        "ayesha.khan@umt.edu.pk",
        "faisal.aziz@umt.edu.pk",
        "nida.shah@umt.edu.pk",
        "hira.saleem@umt.edu.pk",
        "hamza.ali@umt.edu.pk",
        "sana.iqbal@umt.edu.pk",
        "bilal.ahmed@umt.edu.pk",
        "usman.tariq@umt.edu.pk",
        "maryam.noor@umt.edu.pk",
        "ali.raza@umt.edu.pk",
        "zainab.fatima@umt.edu.pk",
    }
)


async def _connect(db_name: str | None = None):
    global db_client
    from app.core import db as db_module

    db_module.client = AsyncMongoClient(settings.MONGO_URI)
    if db_name:
        settings.MONGO_DB = db_name
    await create_indexes()
    return db_module.get_db()


async def cmd_create_admin(args: argparse.Namespace) -> int:
    db = await _connect(args.db)
    if await db.users.find_one({"email": args.email.strip().lower()}):
        print("Email already exists.", file=sys.stderr)
        return 1
    password = args.password or getpass.getpass("Password: ")
    err = validate_password(password, email=args.email, name=args.name)
    if err:
        print(err, file=sys.stderr)
        return 1
    from app.services import setup as setup_service

    # If users exist, still allow CLI create of an admin? Spec says refuses if email exists.
    # First-admin path only when empty; otherwise insert admin.
    if await db.users.count_documents({}) == 0:
        await setup_service.create_first_admin(
            args.name, args.email, password, args.institution or "", args.term or ""
        )
    else:
        from datetime import UTC, datetime

        await db.users.insert_one(
            {
                "name": args.name,
                "email": args.email.strip().lower(),
                "password_hash": hash_password(password),
                "role": "admin",
                "dept_id": None,
                "status": "active",
                "must_change_password": False,
                "token_version": 0,
                "created_at": datetime.now(UTC),
                "created_by": None,
                "last_login_at": None,
            }
        )
    print("Admin ready.")
    return 0


async def cmd_migrate(args: argparse.Namespace) -> int:
    db = await _connect(args.db)
    changed = 0
    async for u in db.users.find({}):
        updates = {}
        if "token_version" not in u:
            updates["token_version"] = 0
        if "must_change_password" not in u:
            updates["must_change_password"] = False
        if "created_at" not in u:
            updates["created_at"] = u["_id"].generation_time
        if "created_by" not in u:
            updates["created_by"] = None
        if "last_login_at" not in u:
            updates["last_login_at"] = None
        if updates:
            await db.users.update_one({"_id": u["_id"]}, {"$set": updates})
            changed += 1
            print(f"  user {u.get('email')}: +{list(updates)}")
    from app.services import settings as settings_service

    before = await db.settings.count_documents({})
    await settings_service.ensure_settings_document()
    after = await db.settings.count_documents({})
    if after > before:
        print("  settings document created")
        changed += 1
    print(f"migrate done; {changed} change(s)")
    return 0


async def cmd_purge_demo(args: argparse.Namespace) -> int:
    db_name = args.db_name or settings.MONGO_DB
    if args.yes and args.db_name != db_name:
        print("--db-name must match exactly when using --yes", file=sys.stderr)
        return 1
    if args.yes and not args.db_name:
        print("--yes requires --db-name <exact>", file=sys.stderr)
        return 1
    db = await _connect(db_name)
    targets = []
    async for u in db.users.find({}):
        email = u.get("email", "")
        is_legacy = email in LEGACY_DEMO_EMAILS
        is_demo_pw = False
        try:
            is_demo_pw = verify_password("demo123", u.get("password_hash", ""))
        except Exception:
            pass
        if is_legacy or is_demo_pw:
            targets.append((u, is_legacy, is_demo_pw))

    print(f"Database: {db_name}")
    print(f"Candidates: {len(targets)}")
    for u, leg, pw in targets:
        uid = str(u["_id"])
        refs = {
            "classes_teacher": await db.classes.count_documents({"teacher_id": uid}),
            "classes_student": await db.classes.count_documents({"student_ids": uid}),
            "exams": await db.exams.count_documents({"teacher_id": uid}),
            "attempts": await db.attempts.count_documents({"student_id": uid}),
            "materials": await db.materials.count_documents({"uploaded_by": uid}),
            "notifications": await db.notifications.count_documents({"to_user_id": uid}),
        }
        print(f"  {u.get('email')} legacy={leg} demo123={pw} refs={refs}")

    if not args.yes:
        print("Dry run only. Re-run with --yes --db-name <exact> to apply.")
        return 0

    for u, leg, pw in targets:
        if leg:
            await db.users.delete_one({"_id": u["_id"]})
            print(f"  deleted {u.get('email')}")
        elif pw:
            from app.services.passwords import generate_temporary_password

            temp = generate_temporary_password()
            await db.users.update_one(
                {"_id": u["_id"]},
                {
                    "$set": {
                        "password_hash": hash_password(temp),
                        "must_change_password": True,
                        "token_version": int(u.get("token_version", 0)) + 1,
                        "status": "inactive",
                    }
                },
            )
            print(f"  deactivated weak-password user {u.get('email')}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("create-admin")
    p.add_argument("--name", required=True)
    p.add_argument("--email", required=True)
    p.add_argument("--password", default=None)
    p.add_argument("--institution", default="")
    p.add_argument("--term", default="")
    p.add_argument("--db", default=None)

    p = sub.add_parser("migrate")
    p.add_argument("--db", default=None)

    p = sub.add_parser("purge-demo")
    p.add_argument("--dry-run", action="store_true", default=True)
    p.add_argument("--yes", action="store_true")
    p.add_argument("--db-name", default=None)

    args = parser.parse_args(argv)
    if args.cmd == "create-admin":
        return asyncio.run(cmd_create_admin(args))
    if args.cmd == "migrate":
        return asyncio.run(cmd_migrate(args))
    if args.cmd == "purge-demo":
        return asyncio.run(cmd_purge_demo(args))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
