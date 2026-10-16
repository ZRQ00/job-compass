from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app import models  # noqa: F401  (registers tables on Base)

    Base.metadata.create_all(bind=engine)
    _retire_saved_status()


def _retire_saved_status():
    """'saved' was removed as a status. Anything still marked saved becomes applied."""
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("UPDATE jobs SET status = 'applied' WHERE status = 'saved'"))
