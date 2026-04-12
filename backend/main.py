"""SmartFlow AI Automation Platform — FastAPI Backend."""

import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from database import engine, Base
from routers import business, ai_settings, leads, conversations, dashboard, whatsapp, media


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup and seed defaults."""
    from database import async_session
    from sqlalchemy import select
    from models import Business, AISetting

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed default business & AI settings if not exists
    async with async_session() as session:
        async with session.begin():
            result = await session.execute(select(Business).where(Business.id == 1))
            if not result.scalar_one_or_none():
                session.add(Business(name="My Business"))
                await session.flush()
            result = await session.execute(select(AISetting).where(AISetting.business_id == 1))
            if not result.scalar_one_or_none():
                session.add(AISetting(business_id=1))

    yield
    await engine.dispose()


app = FastAPI(
    title="SmartFlow AI",
    description="AI-Powered WhatsApp Automation Platform",
    version="1.0.0",
    lifespan=lifespan,
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
