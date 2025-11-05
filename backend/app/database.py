from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# SQLite adatbázis a backend mappában: app.db
SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"

# check_same_thread=False kell, ha több szál vagy több request használja
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
