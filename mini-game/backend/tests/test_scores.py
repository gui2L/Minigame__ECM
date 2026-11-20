import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from scores import Score, create_app


def test_healthcheck(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'test.sqlite'}")
    try:
        with TestClient(app) as client:
            response = client.get("/health")
            assert response.status_code == 200
            assert response.json() == {"status": "ok", "database": "ok"}
    finally:
        app.state.engine.dispose()


def test_leaderboard_starts_empty(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'test.sqlite'}")
    try:
        with TestClient(app) as client:
            response = client.get("/scores/")
            assert response.status_code == 200
            assert response.json() == []
    finally:
        app.state.engine.dispose()


def test_score_round_trip(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'test.sqlite'}")
    try:
        with TestClient(app) as client:
            payload = {
                "points": 900,
                "max_combo": 5,
                "yellow_hits": 1,
                "orange_hits": 1,
                "red_hits": 2,
                "white_hits": 1,
            }
            response = client.post("/scores/", json=payload)
            assert response.status_code == 201
            body = response.json()
            assert body["points"] == 900
            assert body["max_combo"] == 5
            assert body["yellow_hits"] == 1
            assert body["orange_hits"] == 1
            assert body["red_hits"] == 2
            assert body["white_hits"] == 1
            rows = client.get("/scores/").json()
            assert rows == [body]
    finally:
        app.state.engine.dispose()


def test_higher_score_replaces_record_and_breakdown(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'test.sqlite'}")
    try:
        with TestClient(app) as client:
            first = client.post("/scores/", json={"points": 300, "max_combo": 3, "red_hits": 2}).json()
            assert first["points"] == 300
            assert first["red_hits"] == 2

            second = client.post(
                "/scores/",
                json={
                    "points": 1800,
                    "max_combo": 12,
                    "yellow_hits": 2,
                    "orange_hits": 3,
                    "red_hits": 5,
                    "white_hits": 2,
                },
            )
            assert second.status_code == 201
            data = second.json()
            assert data["points"] == 1800
            assert data["max_combo"] == 12
            assert data["yellow_hits"] == 2
            assert data["orange_hits"] == 3
            assert data["red_hits"] == 5
            assert data["white_hits"] == 2
    finally:
        app.state.engine.dispose()


def test_lower_or_equal_score_does_not_replace_record(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'test.sqlite'}")
    try:
        with TestClient(app) as client:
            client.post("/scores/", json={"points": 5000, "max_combo": 20, "white_hits": 4})

            lower = client.post("/scores/", json={"points": 2000, "max_combo": 25, "white_hits": 9})
            assert lower.status_code == 200
            assert lower.json()["points"] == 5000
            assert lower.json()["max_combo"] == 20
            assert lower.json()["white_hits"] == 4

            equal = client.post("/scores/", json={"points": 5000, "max_combo": 30, "white_hits": 10})
            assert equal.status_code == 200
            assert equal.json()["points"] == 5000
            assert equal.json()["white_hits"] == 4
    finally:
        app.state.engine.dispose()


@pytest.mark.parametrize("data", [
    {},
    {"points": -1},
    {"points": 1_000_001},
    {"points": "100"},
    {"points": 100.5},
    {"points": True},
    {"points": 100, "max_combo": -1},
    {"points": 100, "yellow_hits": -1},
    {"points": 100, "orange_hits": 10_001},
    {"points": 100, "red_hits": "2"},
    {"points": 100, "white_hits": True},
    {"points": 100, "extra": "forbidden"},
])
def test_invalid_score_rejected_without_modifying_db(tmp_path, data):
    app = create_app(f"sqlite:///{tmp_path / 'test.sqlite'}")
    try:
        with TestClient(app) as client:
            client.post("/scores/", json={"points": 200, "max_combo": 2, "red_hits": 1})
            assert client.post("/scores/", json=data).status_code == 422
            rows = client.get("/scores/").json()
            assert len(rows) == 1
            assert rows[0]["points"] == 200
            assert rows[0]["red_hits"] == 1
    finally:
        app.state.engine.dispose()


def test_cleans_up_multiple_legacy_rows(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'test.sqlite'}")
    try:
        with Session(app.state.engine) as session:
            session.add_all([Score(points=900, max_combo=8), Score(points=400, max_combo=4)])
            session.commit()

        with TestClient(app) as client:
            response = client.post("/scores/", json={"points": 100, "max_combo": 1})
            assert response.status_code == 200
            assert response.json()["points"] == 900
            rows = client.get("/scores/").json()
            assert len(rows) == 1
    finally:
        app.state.engine.dispose()


def test_data_survives_new_application(tmp_path):
    url = f"sqlite:///{tmp_path / 'restart.sqlite'}"
    app = create_app(url)
    with TestClient(app) as client:
        client.post(
            "/scores/",
            json={"points": 2400, "max_combo": 15, "red_hits": 6, "white_hits": 2},
        )
    app.state.engine.dispose()

    other = create_app(url)
    try:
        with TestClient(other) as client:
            scores = client.get("/scores/").json()
            assert len(scores) == 1
            assert scores[0]["points"] == 2400
            assert scores[0]["red_hits"] == 6
            assert scores[0]["white_hits"] == 2
    finally:
        other.state.engine.dispose()

def test_match_round_trip(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'test.sqlite'}")
    try:
        with TestClient(app) as client:
            assert client.get("/matches/").json() == []
            payload = {
                "p1_name": "Alice",
                "p2_name": "Bob",
                "winner": "left",
                "winner_name": "Alice",
                "p1_max_combo": 9,
                "p2_max_combo": 4,
                "p1_white_hits": 2,
                "p2_white_hits": 0,
            }
            created = client.post("/matches/", json=payload)
            assert created.status_code == 201
            body = created.json()
            assert body["p1_name"] == "Alice"
            assert body["winner_name"] == "Alice"
            assert client.get("/matches/").json() == [body]
    finally:
        app.state.engine.dispose()