from pydantic import BaseModel, Field


class AIQueryRequest(BaseModel):
    # Bounded to limit prompt abuse and model cost
    query: str = Field(..., min_length=1, max_length=500)


class AIQueryResponse(BaseModel):
    query: str
    answer: str
