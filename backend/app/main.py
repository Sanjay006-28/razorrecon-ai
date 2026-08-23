from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import upload, reconcile, summary

# ---------------------------------------------------------------------------
# Create all SQLAlchemy tables on startup
# ---------------------------------------------------------------------------
Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Application instance
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Razorpay Reconciliation API",
    description=(
        "AI-powered financial reconciliation backend. "
        "Upload internal and bank transaction files, run reconciliation, "
        "and retrieve AI-generated insights and exception reports."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server running on localhost:5173
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(upload.router, prefix="/api/v1")
app.include_router(reconcile.router, prefix="/api/v1")
app.include_router(summary.router, prefix="/api/v1")


# ---------------------------------------------------------------------------
# Core endpoints
# ---------------------------------------------------------------------------

@app.get("/", tags=["Root"])
async def root():
    """Landing endpoint — confirms the API is reachable."""
    return {
        "message": "Razorpay Reconciliation API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """
    Health check endpoint.
    Returns 200 OK with service status when the application is running correctly.
    """
    return {
        "status": "healthy",
        "service": "razorpay-reconciliation-api",
        "version": "1.0.0",
    }
