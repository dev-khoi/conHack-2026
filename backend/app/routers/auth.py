from __future__ import annotations

import os
from datetime import UTC, datetime
from functools import lru_cache

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import (
    ExpiredSignatureError,
    InvalidAudienceError,
    InvalidIssuerError,
    InvalidTokenError,
    MissingRequiredClaimError,
    PyJWKClient,
)
from pymongo import MongoClient
from pymongo.collection import Collection

router = APIRouter()
security = HTTPBearer(auto_error=False)


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise HTTPException(
            status_code=500, detail=f"{name} is not configured in backend environment."
        )
    return value


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    domain = _required_env("AUTH0_DOMAIN").strip().rstrip("/")
    return PyJWKClient(f"https://{domain}/.well-known/jwks.json")


@lru_cache(maxsize=1)
def _users_collection() -> Collection:
    mongo_uri = _required_env("MONGODB_URI")
    db_name = os.getenv("MONGODB_DB_NAME", "aura")
    client = MongoClient(mongo_uri)
    collection = client[db_name]["users"]
    collection.create_index("auth0_sub", unique=True)
    return collection


def _verify_access_token(token: str) -> dict:
    domain = _required_env("AUTH0_DOMAIN").strip().rstrip("/")
    audience = _required_env("AUTH0_AUDIENCE")

    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=audience,
            issuer=f"https://{domain}/",
        )
        if "sub" not in claims:
            raise HTTPException(
                status_code=401, detail="Token is missing required subject claim."
            )
        return claims
    except ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Access token is expired.") from exc
    except InvalidAudienceError as exc:
        raise HTTPException(
            status_code=401,
            detail="Access token audience (aud) does not match AUTH0_AUDIENCE.",
        ) from exc
    except InvalidIssuerError as exc:
        raise HTTPException(
            status_code=401,
            detail="Access token issuer (iss) does not match AUTH0_DOMAIN.",
        ) from exc
    except MissingRequiredClaimError as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Access token is missing required claim: {exc.claim}.",
        ) from exc
    except HTTPException:
        raise
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=401, detail="Invalid access token."
        ) from exc


def _require_claim_str(claims: dict, key: str) -> str | None:
    value = claims.get(key)
    if isinstance(value, str) and value.strip():
        return value
    return None


@router.post("/sync")
def sync_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, str | bool]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        print("/auth/sync missing Bearer token")
        raise HTTPException(status_code=401, detail="Missing Bearer token.")

    try:
        claims = _verify_access_token(credentials.credentials)
    except HTTPException as exc:
        # Log the specific reason server-side (safe: does not include token).
        print(f"/auth/sync unauthorized: {exc.detail}")
        raise
    now = datetime.now(UTC)

    user_doc = {
        "auth0_sub": claims["sub"],
        "email": _require_claim_str(claims, "email"),
        "name": _require_claim_str(claims, "name"),
        "nickname": _require_claim_str(claims, "nickname"),
        "picture": _require_claim_str(claims, "picture"),
        "email_verified": bool(claims.get("email_verified", False)),
        "updated_at_auth0": _require_claim_str(claims, "updated_at"),
        "last_seen_at": now,
    }
    print(f"Syncing user {claims['sub']} - {user_doc['email']}")
    collection = _users_collection()
    result = collection.update_one(
        {"auth0_sub": claims["sub"]},
        {
            "$set": user_doc,
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    created = result.upserted_id is not None
    return {
        "status": "ok",
        "created": created,
        "auth0_sub": claims["sub"],
    }


@router.get('/whoami')
def whoami(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> dict[str, object]:
    if credentials is None or credentials.scheme.lower() != 'bearer':
        raise HTTPException(status_code=401, detail='Missing Bearer token.')

    claims = _verify_access_token(credentials.credentials)
    return {
        'sub': claims.get('sub'),
        'aud': claims.get('aud'),
        'iss': claims.get('iss'),
        'scope': claims.get('scope'),
    }
