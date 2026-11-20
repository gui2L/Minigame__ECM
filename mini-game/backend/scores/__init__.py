from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Score(Base):
    __tablename__ = "score"
    id: Mapped[int] = mapped_column(primary_key=True)
    points: Mapped[int]
    max_combo: Mapped[int] = mapped_column(default=0)
    yellow_hits: Mapped[int] = mapped_column(default=0)
    orange_hits: Mapped[int] = mapped_column(default=0)
    red_hits: Mapped[int] = mapped_column(default=0)
    white_hits: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[str] = mapped_column(default=lambda: datetime.now(timezone.utc).isoformat())


class Match(Base):
    __tablename__ = "duel_match"
    id: Mapped[int] = mapped_column(primary_key=True)
    p1_name: Mapped[str]
    p2_name: Mapped[str]
    winner: Mapped[str]
    winner_name: Mapped[str]
    p1_max_combo: Mapped[int] = mapped_column(default=0)
    p2_max_combo: Mapped[int] = mapped_column(default=0)
    p1_white_hits: Mapped[int] = mapped_column(default=0)
    p2_white_hits: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[str] = mapped_column(default=lambda: datetime.now(timezone.utc).isoformat())


class ScoreCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    points: Annotated[int, Field(strict=True, ge=0, le=1_000_000)]
    max_combo: Annotated[int, Field(strict=True, ge=0, le=10_000)] = 0
    yellow_hits: Annotated[int, Field(strict=True, ge=0, le=10_000)] = 0
    orange_hits: Annotated[int, Field(strict=True, ge=0, le=10_000)] = 0
    red_hits: Annotated[int, Field(strict=True, ge=0, le=10_000)] = 0
    white_hits: Annotated[int, Field(strict=True, ge=0, le=10_000)] = 0


class ScoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    points: int
    max_combo: int
    yellow_hits: int
    orange_hits: int
    red_hits: int
    white_hits: int
    created_at: str


class MatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    p1_name: Annotated[str, Field(min_length=1, max_length=32)]
    p2_name: Annotated[str, Field(min_length=1, max_length=32)]
    winner: Literal["left", "right", "draw"]
    winner_name: Annotated[str, Field(min_length=1, max_length=32)]
    p1_max_combo: Annotated[int, Field(strict=True, ge=0, le=10_000)] = 0
    p2_max_combo: Annotated[int, Field(strict=True, ge=0, le=10_000)] = 0
    p1_white_hits: Annotated[int, Field(strict=True, ge=0, le=10_000)] = 0
    p2_white_hits: Annotated[int, Field(strict=True, ge=0, le=10_000)] = 0


class MatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    p1_name: str
    p2_name: str
    winner: str
    winner_name: str
    p1_max_combo: int
    p2_max_combo: int
    p1_white_hits: int
    p2_white_hits: int
    created_at: str


class HealthRead(BaseModel):
    status: str
    database: str


def create_app(database_url=None):
    if database_url is None:
        folder = Path(__file__).resolve().parent.parent / "instance"
        folder.mkdir(exist_ok=True)
        database_url = f"sqlite:///{folder / 'scores.sqlite'}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    app = FastAPI(title="ECM · Scores")
    app.state.engine = engine
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5175", "http://127.0.0.1:5175"],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    def get_session():
        with Session(engine) as session:
            yield session

    DatabaseSession = Annotated[Session, Depends(get_session)]

    @app.get("/health", response_model=HealthRead)
    def healthcheck(session: DatabaseSession):
        try:
            session.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database unavailable",
            ) from exc
        return {"status": "ok", "database": "ok"}

    @app.get("/scores/", response_model=list[ScoreRead])
    def list_scores(session: DatabaseSession):
        return session.scalars(select(Score).order_by(Score.points.desc(), Score.id).limit(1)).all()

    @app.post("/scores/", response_model=ScoreRead)
    def save_score(data: ScoreCreate, session: DatabaseSession, response: Response):
        scores = session.scalars(select(Score).order_by(Score.points.desc(), Score.id)).all()
        current_best = scores[0] if scores else None

        if current_best is None:
            score = Score(**data.model_dump())
            session.add(score)
            session.commit()
            session.refresh(score)
            response.status_code = status.HTTP_201_CREATED
            return score

        if data.points > current_best.points:
            for extra in scores[1:]:
                session.delete(extra)
            current_best.points = data.points
            current_best.max_combo = data.max_combo
            current_best.yellow_hits = data.yellow_hits
            current_best.orange_hits = data.orange_hits
            current_best.red_hits = data.red_hits
            current_best.white_hits = data.white_hits
            current_best.created_at = datetime.now(timezone.utc).isoformat()
            session.commit()
            session.refresh(current_best)
            response.status_code = status.HTTP_201_CREATED
            return current_best

        for extra in scores[1:]:
            session.delete(extra)
        if len(scores) > 1:
            session.commit()
            session.refresh(current_best)
        response.status_code = status.HTTP_200_OK
        return current_best

    @app.get("/matches/", response_model=list[MatchRead])
    def list_matches(session: DatabaseSession):
        return session.scalars(select(Match).order_by(Match.id.desc()).limit(10)).all()

    @app.post("/matches/", response_model=MatchRead, status_code=status.HTTP_201_CREATED)
    def save_match(data: MatchCreate, session: DatabaseSession):
        match = Match(
            p1_name=data.p1_name.strip() or "Joueur 1",
            p2_name=data.p2_name.strip() or "Joueur 2",
            winner=data.winner,
            winner_name=data.winner_name.strip() or "Joueur 1",
            p1_max_combo=data.p1_max_combo,
            p2_max_combo=data.p2_max_combo,
            p1_white_hits=data.p1_white_hits,
            p2_white_hits=data.p2_white_hits,
        )
        session.add(match)
        session.commit()
        session.refresh(match)
        return match

    return app