from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.deps import CurrentUser, get_current_user, require_role
from app.core.ratelimit import check_llm_rate_limit
from app.schemas.materials import MaterialOut, MaterialSummaryOut
from app.schemas.study_assistant import AskRequest, AskResponse
from app.services import materials as material_service
from app.services import study_assistant as study_assistant_service

router = APIRouter(tags=["materials"])


@router.post(
    "/api/classes/{class_id}/materials", response_model=MaterialSummaryOut, status_code=201
)
async def upload_material(
    class_id: str,
    request: Request,
    teacher: CurrentUser = Depends(require_role("teacher")),
):
    content_type = (request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
    if content_type == "multipart/form-data":
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise HTTPException(status_code=400, detail="No file was uploaded.")
        data = await upload.read()
        name = form.get("name") or upload.filename or "Untitled material"
        replace_raw = str(form.get("replace") or "").strip().lower()
        replace = replace_raw in ("1", "true", "yes", "on")
        return await material_service.upload_pdf_material(
            teacher, class_id, filename=name, data=data, replace=replace
        )
    if content_type == "application/json":
        body = await request.json() or {}
        url = body.get("url")
        if url:
            return await material_service.upload_url_material(
                teacher, class_id, url=url, name=body.get("name")
            )
        name = body.get("name")
        text = body.get("text")
        if not name or text is None:
            raise HTTPException(status_code=400, detail="Provide {name, text} or {url}.")
        return await material_service.upload_text_material(
            teacher, class_id, name=name, text=text
        )
    raise HTTPException(
        status_code=400,
        detail="Send a PDF/DOCX/PPTX file or JSON {name, text} or {url}.",
    )


@router.get("/api/classes/{class_id}/materials", response_model=list[MaterialSummaryOut])
async def list_materials(class_id: str, user: CurrentUser = Depends(get_current_user)):
    return await material_service.list_materials(user, class_id)


@router.get("/api/materials/{material_id}", response_model=MaterialOut)
async def get_material(material_id: str, user: CurrentUser = Depends(get_current_user)):
    return await material_service.get_material(user, material_id)


@router.delete("/api/materials/{material_id}", status_code=204)
async def delete_material(
    material_id: str, teacher: CurrentUser = Depends(require_role("teacher"))
):
    await material_service.delete_material(teacher, material_id)


@router.post("/api/materials/{material_id}/ask", response_model=AskResponse)
async def ask_material(
    material_id: str,
    payload: AskRequest,
    student: CurrentUser = Depends(require_role("student")),
):
    check_llm_rate_limit(student)
    return await study_assistant_service.ask_material(student, material_id, payload.question)
