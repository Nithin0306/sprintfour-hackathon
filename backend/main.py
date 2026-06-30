from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import detect

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router)

@app.get("/ping")
def ping():
    return {"status": "ok"}
