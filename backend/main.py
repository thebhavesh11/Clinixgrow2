"""SmartFlow AI Automation Platform — FastAPI Backend."""

import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

# ── Structured Logging ────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("smartflow")

from database import engine, Base
from routers import business, ai_settings, leads, conversations, dashboard, whatsapp, media


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup and seed defaults."""
    from database import async_session
    from sqlalchemy import select
    from models import Business, AISetting

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created/verified")

        # Seed default business & AI settings if not exists
        async with async_session() as session:
            async with session.begin():
                result = await session.execute(select(Business).where(Business.id == 1))
                if not result.scalar_one_or_none():
                    session.add(Business(name="My Business"))
                    await session.flush()
                    logger.info("Seeded default business profile")
                result = await session.execute(select(AISetting).where(AISetting.business_id == 1))
                if not result.scalar_one_or_none():
                    session.add(AISetting(business_id=1))
                    logger.info("Seeded default AI settings")
    except Exception as e:
        logger.error(f"Startup error: {type(e).__name__}: {e}")
        raise

    yield
    await engine.dispose()
    logger.info("Database connections closed")


app = FastAPI(
    title="SmartFlow AI",
    description="AI-Powered WhatsApp Automation Platform",
    version="1.0.0",
    lifespan=lifespan,
)


# ── Global Exception Handler ─────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch any unhandled exception and return a structured error instead of crashing."""
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


# CORS — Allow all origins for Codespaces compatibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(business.router)
app.include_router(ai_settings.router)
app.include_router(leads.router)
app.include_router(conversations.router)
app.include_router(dashboard.router)
app.include_router(whatsapp.router)
app.include_router(media.router)


@app.get("/")
async def root():
    return {"name": "SmartFlow AI", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
