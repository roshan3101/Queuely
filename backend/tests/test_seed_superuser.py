from types import SimpleNamespace

from queuely.core.seed import seed_superuser


def test_seed_superuser_creates_account(monkeypatch):
    from queuely.core import seed as seed_module

    monkeypatch.setattr(seed_module, "hash_password", lambda password: f"hash:{password}")

    db = SimpleNamespace()
    db.scalar = lambda _stmt: None
    db.add_calls = []
    db.commit_calls = 0

    def add(user):
        db.add_calls.append(user)

    def commit():
        db.commit_calls += 1

    db.add = add
    db.commit = commit

    settings = SimpleNamespace(
        seed_superuser_email="admin@queuely.com",
        seed_superuser_password="secret123",
        seed_superuser_full_name="Local Admin",
    )

    seed_superuser(db, settings)

    assert db.commit_calls == 1
    assert len(db.add_calls) == 1
    user = db.add_calls[0]
    assert user.email == "admin@queuely.com"
    assert user.password_hash == "hash:secret123"
    assert user.is_superuser is False
    assert user.is_active is True


def test_seed_superuser_updates_existing_password_and_role(monkeypatch):
    from queuely.core import seed as seed_module

    monkeypatch.setattr(seed_module, "hash_password", lambda password: f"hash:{password}")

    existing_user = SimpleNamespace(
        email="admin@queuely.com",
        password_hash="hash:old-password",
        full_name="Local Admin",
        is_active=False,
        is_superuser=True,
    )

    db = SimpleNamespace()
    db.scalar = lambda _stmt: existing_user
    db.add = lambda _user: None
    db.commit_calls = 0

    def commit():
        db.commit_calls += 1

    db.commit = commit

    settings = SimpleNamespace(
        seed_superuser_email="admin@queuely.com",
        seed_superuser_password="secret123",
        seed_superuser_full_name="Local Admin",
    )

    seed_superuser(db, settings)

    assert db.commit_calls == 1
    assert existing_user.password_hash == "hash:secret123"
    assert existing_user.is_superuser is False
    assert existing_user.is_active is True

