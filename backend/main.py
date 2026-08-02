"""
CircuitSense — FastAPI application entrypoint.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from dotenv import load_dotenv

load_dotenv()

from database import init_db
from routers.circuits import router as circuits_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — initialising database …")
    await init_db()
    logger.info("Database ready.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="CircuitSense API",
    description=(
        "Analyse electronic circuits for electrical correctness (Layer A — deterministic) "
        "and hardware security vulnerabilities (Layer B — LLM-powered via OpenRouter). "
        "\n\nSubmit circuits as JSON netlists or photo uploads. "
        "All past analyses are persisted in SQLite for retrieval."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow the Vite dev server (and any origin in dev) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(circuits_router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "service": "CircuitSense API"}


# Serve static assets (JS, CSS, images) from the /assets/ directory
if os.path.isdir("static/assets"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

# Serve all other static files (like favicon) from the root of static
if os.path.isdir("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Catch-all route to serve the React SPA index.html
@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    # Check if the requested file exists in the static directory
    file_path = os.path.join("static", full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # Fallback to index.html for React Router
    index_path = os.path.join("static", "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    
    return {"error": "Frontend build not found. Run build.sh."}
