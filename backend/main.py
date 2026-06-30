from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import detect, context

app = FastAPI(title="Conseal Redaction API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for Render + Vercel deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router)
app.include_router(context.router)

@app.get("/ping")
def ping():
    return {"status": "ok"}
