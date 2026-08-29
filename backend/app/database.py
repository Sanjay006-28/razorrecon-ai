from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "reconciliation.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # Required for SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_columns():
    """Ensure newly added columns exist in SQLite database tables."""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        if "exceptions" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("exceptions")]
            with engine.begin() as conn:
                for col in ["ai_explanation", "ai_root_cause", "ai_suggested_action"]:
                    if col not in columns:
                        conn.execute(text(f"ALTER TABLE exceptions ADD COLUMN {col} TEXT"))
    except Exception:
        pass

ensure_columns()


def get_db():
    """Dependency that provides a database session and ensures it is closed after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

