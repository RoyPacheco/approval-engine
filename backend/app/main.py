from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routes import chains, workflows, connections, reference, coupa, export

app = FastAPI(
    title="Approval Chain Creator API",
    version="2.0.0",
    description="Python backend for the Coupa Approval Chain Builder — handles persistence, OAuth proxy, and CSV export.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chains.router,      prefix="/api/chains",      tags=["chains"])
app.include_router(workflows.router,   prefix="/api/workflows",   tags=["workflows"])
app.include_router(connections.router, prefix="/api/connections", tags=["connections"])
app.include_router(reference.router,   prefix="/api/reference",   tags=["reference"])
app.include_router(coupa.router,       prefix="/api/coupa",       tags=["coupa"])
app.include_router(export.router,      prefix="/api/export",      tags=["export"])


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok", "version": "2.0.0"}
