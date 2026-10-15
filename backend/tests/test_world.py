import os

import pytest
from bson import ObjectId
from pymongo import AsyncMongoClient

from app.core.config import settings
from tests.support.world import main as world_main

TEST_DB = os.environ.get("TEST_MONGO_DB", "cogni_test_dev")


@pytest.fixture
async def world_db():
    settings.MONGO_DB = TEST_DB
    await world_main(force=False)
    client = AsyncMongoClient(settings.MONGO_URI)
    db = client[TEST_DB]
    yield db
    await client.close()


async def test_world_creates_demo_users(world_db):
    count = await world_db.users.count_documents({})
    assert count >= 12


async def test_every_class_has_teacher_in_same_department(world_db):
    async for cls in world_db.classes.find():
        teacher = await world_db.users.find_one({"_id": ObjectId(cls["teacher_id"])})
        assert teacher is not None
        assert teacher["dept_id"] == cls["dept_id"]


async def test_every_exam_class_exists(world_db):
    async for exam in world_db.exams.find():
        cls = await world_db.classes.find_one({"_id": ObjectId(exam["class_id"])})
        assert cls is not None


async def test_every_attempt_references_existing_exam_and_student(world_db):
    async for attempt in world_db.attempts.find():
        exam = await world_db.exams.find_one({"_id": ObjectId(attempt["exam_id"])})
        student = await world_db.users.find_one({"_id": ObjectId(attempt["student_id"])})
        assert exam is not None
        assert student is not None
