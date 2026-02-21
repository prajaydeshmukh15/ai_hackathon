from pydantic import BaseModel
from enum import Enum

class RiskLevel(str, Enum):
    SAFE = "SAFE"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class PredictRequest(BaseModel):
    identifier: str = ""
    daysinstock: float
    weeklysales30d: float
    stockqty: float
    discountstried: int
    seasonmatch: float = 1.0

class PredictResponse(BaseModel):
    risk_percent: float
    label: int
    days_to_dead: float
    action: str

class LoginRequest(BaseModel):
    empId: str
    password: str
    region: str

class LoginResponse(BaseModel):
    user: dict
    message: str
