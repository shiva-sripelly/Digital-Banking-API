from fastapi import Request


def client_ip(request: Request) -> str:
    # Behind a reverse proxy, run uvicorn with --proxy-headers so request.client
    # reflects X-Forwarded-For from the trusted proxy only.
    return request.client.host if request.client else "unknown"


def user_agent(request: Request) -> str:
    return (request.headers.get("user-agent") or "")[:255]
