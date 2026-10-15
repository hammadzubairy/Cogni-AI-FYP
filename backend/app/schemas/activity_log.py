from datetime import datetime

from app.schemas.common import OutBase


class ActivityLogOut(OutBase):
    at: datetime
    actor_id: str
    actor_name: str
    role: str
    text: str
