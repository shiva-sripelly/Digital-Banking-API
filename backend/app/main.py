from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, engine

from app.models import user, account, transaction
from app.api.routes.auth import router as auth_router
from app.api.routes.account import router as account_router
from app.api.routes.transaction import router as transaction_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Digital Banking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(account_router)
app.include_router(transaction_router)


@app.get("/")
def root():
    return {"message": "Digital Banking API is running"}