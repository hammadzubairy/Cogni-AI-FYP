from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import OutBase


class NotificationLink(BaseModel):
    page: str
    id: str


class NotificationOut(OutBase):
    to_user_id: str
    text: str
    link: NotificationLink | None = None
    read: bool
    created_at: datetime


class NotificationsListOut(BaseModel):
    items: list[NotificationOut]
    unread_count: int
