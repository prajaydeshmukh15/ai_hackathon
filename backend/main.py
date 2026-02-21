from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import os
from backend.models import PredictRequest, LoginRequest, LoginResponse
from backend.ml_service import ml_service

app = FastAPI(title="MediStock AI API")

# ---------------- CORS ----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- FRONTEND ----------------
# Mount static frontend using absolute path
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR), name="frontend")

# ---------------- ROUTES ----------------
@app.get("/api/health")
async def health():
    return {"status": "API working!"}

@app.get("/")
async def root():
    return RedirectResponse(url="/frontend/index.html", status_code=307)

# ---------------- LOGIN ----------------
@app.post("/api/login")
async def login(credentials: LoginRequest):
    # Simple validation - accepts any EMP-XXXX format with password length >= 6
    if credentials.empId.startswith("EMP-") and len(credentials.password) >= 6 and credentials.region:
        user_data = {
            "empId": credentials.empId,
            "region": credentials.region,
            "name": f"Employee {credentials.empId.split('-')[1]}"
        }
        return LoginResponse(
            user=user_data,
            message="Login successful"
        )
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")


@app.get("/api/inventory")
async def get_inventory():
    return ml_service.get_inventory()

@app.get("/api/top-risky")
async def get_top_risky(limit: int = 5):
    return ml_service.get_top_risky(limit)

@app.get("/api/kpis")
async def get_kpis():
    return ml_service.kpis()

# ---------------- ML PREDICT ----------------
@app.post("/api/predict")
async def predict(data: PredictRequest):
    return ml_service.predict(data)

# ---------------- SEARCH ----------------
@app.get("/api/search")
async def search(term: str = Query("")):
    return ml_service.search(term)

# ---------------- RISKY LIST ----------------
@app.get("/api/risky")
async def risky():
    return ml_service.get_top_risky(limit=1000)

# ---------------- ANALYTICS HEATMAP ----------------
@app.get("/api/analytics/heatmap")
async def analytics_heatmap():
    return ml_service.heatmap()
