from typing import Literal

from pydantic import BaseModel, Field


LlmProvider = Literal["platform", "openrouter", "groq"]


class LlmModelOption(BaseModel):
    id: str
    label: str


class LlmProviderOption(BaseModel):
    id: LlmProvider
    label: str
    models: list[LlmModelOption] = Field(default_factory=list)
    needs_api_key: bool = False
    key_help_url: str | None = None


class LlmCatalogOut(BaseModel):
    providers: list[LlmProviderOption]


class TeacherLlmSettingsOut(BaseModel):
    provider: LlmProvider = "platform"
    model: str = ""
    api_key_set: bool = False
    api_key_masked: str | None = None
    using_platform: bool = True
    catalog: LlmCatalogOut


class TeacherLlmSettingsUpdate(BaseModel):
    provider: LlmProvider = "platform"
    model: str = ""
    # Blank / omitted keeps the existing key. Set clear_api_key to drop it.
    api_key: str | None = None
    clear_api_key: bool = False
