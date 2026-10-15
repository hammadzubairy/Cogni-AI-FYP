from fastapi import APIRouter, Depends, HTTPException

from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser, get_current_user
from app.schemas.notifications import NotificationsListOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=NotificationsListOut)
async def list_notifications(user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    cursor = db.notifications.find({"to_user_id": user.id}).sort("created_at", -1)
    items = [to_out(n) async for n in cursor]
    unread_count = await db.notifications.count_documents(
        {"to_user_id": user.id, "read": False}
    )
    return {"items": items, "unread_count": unread_count}


@router.post("/{notif_id}/read", status_code=204)
async def mark_read(notif_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    result = await db.notifications.update_one(
        {"_id": oid(notif_id), "to_user_id": user.id}, {"$set": {"read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found.")


@router.post("/read-all", status_code=204)
async def mark_all_read(user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_many(
        {"to_user_id": user.id, "read": False}, {"$set": {"read": True}}
    )
