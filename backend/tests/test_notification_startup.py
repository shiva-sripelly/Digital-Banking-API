import pytest

from app.services import notification_service


class _BrokenQuery:
    def filter(self, *_args, **_kwargs):
        return self

    def update(self, *_args, **_kwargs):
        raise RuntimeError("schema unavailable")


class _BrokenSession:
    def __init__(self):
        self.rolled_back = False
        self.closed = False

    def query(self, *_args, **_kwargs):
        return _BrokenQuery()

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def test_orphan_recovery_does_not_mask_schema_errors(monkeypatch):
    session = _BrokenSession()
    monkeypatch.setattr(notification_service, "SessionLocal", lambda: session)

    with pytest.raises(RuntimeError, match="schema unavailable"):
        notification_service.dispatcher._mark_orphans_failed()

    assert session.rolled_back is True
    assert session.closed is True
