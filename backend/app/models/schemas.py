from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserInfo(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None


class Course(BaseModel):
    id: str
    name: str
    section: Optional[str] = None
    description: Optional[str] = None
    room: Optional[str] = None
    courseState: Optional[str] = None


class Assignment(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    state: Optional[str] = None
    dueDate: Optional[dict] = None
    dueTime: Optional[dict] = None


class DriveFile(BaseModel):
    id: str
    name: str
    mimeType: str
    modifiedTime: Optional[datetime] = None
    webViewLink: Optional[str] = None
